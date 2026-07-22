import type {
  ActionStep,
  Condition,
  EngineContracts,
  LogicStep,
  Piece,
  PieceID,
  RuleActionExecutionResult,
  RuleJSON,
  Side,
  Tile,
  UIActionSpec,
} from "./types";
import {
  Registry,
  type ConditionDescriptor,
  type EngineContext,
} from "./registry";
import {
  CONDITION_OPS,
  createDeterministicRandom,
  EFFECT_OPS,
  PROVIDERS,
  RULE_EVENTS,
  RuntimeBudget,
  RuntimeBudgetExceededError,
} from "../rules-v2";

export interface RuleEngineOptions {
  matchSeed?: string | number;
  maxEffectsPerRuleEvent?: number;
  maxNestedDepth?: number;
}

interface EvaluationOutcome {
  blocked: boolean;
  executed: number;
  turnEnded: boolean;
}

interface MutableEngineSnapshot {
  board: string | null;
  cooldown: string;
  state: string;
}

class RuleRollbackError extends Error {
  constructor(public readonly failures: readonly unknown[]) {
    super("Échec de restauration de la transaction de règle.");
    this.name = "RuleRollbackError";
  }
}

const BLOCKED_LEGACY_EFFECTS = new Set([
  "area.forEachTile",
  "board.areaEffect",
  "composite",
]);

const V2_CONDITIONS = new Set<string>(CONDITION_OPS);
const V2_EFFECTS = new Set<string>(EFFECT_OPS);
const V2_PROVIDERS = new Set<string>(PROVIDERS);
const V2_LIFECYCLE_EVENTS = new Set<string>(
  RULE_EVENTS.filter((event) => event !== "ui.action"),
);
const V2_COMPILED_ACTION_ID_PATTERN =
  /^[a-z][a-z0-9-]{2,49}\.[a-z][a-z0-9-]{1,39}$/;

const cloneRule = (rule: RuleJSON): RuleJSON =>
  JSON.parse(JSON.stringify(rule)) as RuleJSON;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isSide = (value: unknown): value is Side =>
  value === "white" || value === "black";

const isRuleArchitectRule = (rule: RuleJSON): boolean =>
  rule.integration?.ruleArchitect?.source === "ai-blueprint";

const isActionStep = (value: unknown): value is ActionStep =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ActionStep).action === "string",
  );

const isV2ConditionTree = (value: unknown, depth = 0): boolean => {
  if (depth > 8) return false;
  if (typeof value === "string") return V2_CONDITIONS.has(value);
  if (!Array.isArray(value) || value.length === 0) return false;

  const [operation, ...args] = value;
  if (operation === "not") {
    return args.length === 1 && isV2ConditionTree(args[0], depth + 1);
  }
  if (operation === "and" || operation === "or") {
    return (
      args.length > 0 &&
      args.every((item) => isV2ConditionTree(item, depth + 1))
    );
  }
  return typeof operation === "string" && V2_CONDITIONS.has(operation);
};

const scopeCooldownReadyConditionTree = (
  value: unknown,
  actionIds: ReadonlyMap<string, string>,
  allowImplicitActionId: boolean,
  depth = 0,
): boolean => {
  if (depth > 8) return false;
  if (typeof value === "string") {
    return value !== "cooldown.ready" || allowImplicitActionId;
  }
  if (!Array.isArray(value) || value.length === 0) return false;

  const [operation, ...args] = value;
  if (operation === "not" || operation === "and" || operation === "or") {
    return args.every((item) =>
      scopeCooldownReadyConditionTree(
        item,
        actionIds,
        allowImplicitActionId,
        depth + 1,
      ),
    );
  }
  if (operation !== "cooldown.ready") return true;

  if (args.length === 0) return allowImplicitActionId;
  const params = args[0];
  if (args.length !== 1 || !isRecord(params)) return false;
  if (!("actionId" in params)) return allowImplicitActionId;
  if (typeof params.actionId !== "string") return false;

  const scopedId = actionIds.get(params.actionId);
  if (!scopedId) return false;
  params.actionId = scopedId;
  return true;
};

export class RuleEngine {
  private rules: RuleJSON[] = [];
  private readonly handlers = new Map<string, string[]>();
  private readonly uiActions: UIActionSpec[] = [];
  private readonly actionOwners = new Map<string, RuleJSON>();
  private eventSequence = 0;
  private readonly options: Required<RuleEngineOptions>;

  constructor(
    private readonly engine: EngineContracts,
    private readonly registry: Registry,
    options: RuleEngineOptions = {},
  ) {
    this.options = {
      matchSeed: options.matchSeed ?? "local-match",
      maxEffectsPerRuleEvent: options.maxEffectsPerRuleEvent ?? 128,
      maxNestedDepth: options.maxNestedDepth ?? 8,
    };
  }

  loadRules(rules: RuleJSON[]): void {
    const previousActions = [...this.uiActions];
    const uiWithUnregister = this.engine.ui as EngineContracts["ui"] & {
      unregisterAction?: (actionId: string) => void;
    };

    if (uiWithUnregister.unregisterAction) {
      previousActions.forEach((action) =>
        uiWithUnregister.unregisterAction?.(action.id),
      );
    }

    this.handlers.clear();
    this.uiActions.length = 0;
    this.actionOwners.clear();
    this.eventSequence = 0;

    const preparedRules = rules
      .filter((rule) => rule.meta?.isActive !== false)
      .map((rule) => this.prepareRule(rule))
      .filter((rule): rule is RuleJSON => rule !== null)
      .sort((left, right) => {
        const priorityDelta =
          (right.meta?.priority ?? 0) - (left.meta?.priority ?? 0);
        return (
          priorityDelta || left.meta.ruleId.localeCompare(right.meta.ruleId)
        );
      });

    const generatedRuleIds = new Set<string>();
    this.rules = preparedRules.filter((rule) => {
      if (!isRuleArchitectRule(rule)) return true;
      if (generatedRuleIds.has(rule.meta.ruleId)) {
        console.error(
          `[RuleEngine] Version Rule Architect dupliquée refusée: ${rule.meta.ruleId}`,
        );
        return false;
      }
      generatedRuleIds.add(rule.meta.ruleId);
      return true;
    });

    for (const rule of this.rules) {
      for (const action of rule.ui?.actions ?? []) {
        if (this.actionOwners.has(action.id)) {
          console.error(`[RuleEngine] Action dupliquée ignorée: ${action.id}`);
          continue;
        }

        this.actionOwners.set(action.id, rule);
        this.uiActions.push(action);
        this.engine.ui.registerAction(action);
      }

      for (const [eventName, handlerId] of Object.entries(
        rule.handlers ?? {},
      )) {
        const handlers = this.handlers.get(eventName) ?? [];
        handlers.push(String(handlerId));
        this.handlers.set(eventName, handlers);
      }
    }
  }

  /**
   * Published versions may share the model-provided ruleKey/stateNamespace.
   * Runtime IDs are therefore scoped by the immutable versioned ruleId.
   */
  private prepareRule(input: RuleJSON): RuleJSON | null {
    const rule = cloneRule(input);
    if (!isRuleArchitectRule(rule)) return rule;

    const ownerId = rule.meta?.ruleId;
    if (
      typeof ownerId !== "string" ||
      ownerId.length < 1 ||
      ownerId.length > 160 ||
      !/^[a-zA-Z0-9._@:-]+$/.test(ownerId)
    ) {
      console.error("[RuleEngine] ruleId Rule Architect invalide.");
      return null;
    }

    const rootSides = rule.scope?.sides;
    if (
      !Array.isArray(rootSides) ||
      rootSides.length === 0 ||
      rootSides.some((side) => !isSide(side)) ||
      new Set(rootSides).size !== rootSides.length
    ) {
      console.error(`[RuleEngine] Scope de camp invalide dans ${ownerId}.`);
      return null;
    }

    const actionIds = new Map<string, string>();
    const cooldownActionIds = new Map<string, string>();
    const blueprintRuleKey = rule.integration?.ruleArchitect?.blueprintRuleKey;
    const legacyActionPrefix =
      typeof blueprintRuleKey === "string" &&
      /^[a-z][a-z0-9-]{2,49}$/.test(blueprintRuleKey)
        ? `${blueprintRuleKey}.`
        : null;
    for (const action of rule.ui?.actions ?? []) {
      if (
        typeof action.id !== "string" ||
        !V2_COMPILED_ACTION_ID_PATTERN.test(action.id)
      ) {
        console.error(`[RuleEngine] Identifiant d'action V2 invalide.`);
        return null;
      }
      if (actionIds.has(action.id)) {
        console.error(
          `[RuleEngine] Action V2 dupliquée dans ${ownerId}: ${action.id}`,
        );
        return null;
      }
      if (cooldownActionIds.has(action.id)) {
        console.error(
          `[RuleEngine] Alias de cooldown ambigu dans ${ownerId}: ${action.id}`,
        );
        return null;
      }
      const provider = action.targeting?.validTilesProvider;
      if (provider && !V2_PROVIDERS.has(provider)) {
        console.error(
          `[RuleEngine] Provider hors catalogue dans ${ownerId}: ${provider}`,
        );
        return null;
      }
      const scopedId = `${ownerId}::${action.id}`;
      actionIds.set(action.id, scopedId);
      cooldownActionIds.set(action.id, scopedId);
      if (legacyActionPrefix && action.id.startsWith(legacyActionPrefix)) {
        const legacyLocalId = action.id.slice(legacyActionPrefix.length);
        if (/^[a-z][a-z0-9-]{1,39}$/.test(legacyLocalId)) {
          const existingAlias = cooldownActionIds.get(legacyLocalId);
          if (existingAlias && existingAlias !== scopedId) {
            console.error(
              `[RuleEngine] Alias de cooldown ambigu dans ${ownerId}: ${legacyLocalId}`,
            );
            return null;
          }
          cooldownActionIds.set(legacyLocalId, scopedId);
        }
      }
      action.id = scopedId;
    }

    for (const step of rule.logic?.effects ?? []) {
      if (typeof step.when !== "string") {
        console.error(`[RuleEngine] Événement V2 invalide dans ${ownerId}.`);
        return null;
      }
      const isUIEvent = step.when.startsWith("ui.");
      if (!isUIEvent && !V2_LIFECYCLE_EVENTS.has(step.when)) {
        console.error(`[RuleEngine] Événement V2 inconnu dans ${ownerId}.`);
        return null;
      }
      if (step.if !== undefined && !isV2ConditionTree(step.if)) {
        console.error(`[RuleEngine] Condition hors catalogue dans ${ownerId}.`);
        return null;
      }
      if (
        step.if !== undefined &&
        !scopeCooldownReadyConditionTree(step.if, cooldownActionIds, isUIEvent)
      ) {
        console.error(`[RuleEngine] Cooldown sans action dans ${ownerId}.`);
        return null;
      }
      if (isUIEvent) {
        const originalId = step.when.slice(3);
        const scopedId = actionIds.get(originalId);
        if (!scopedId) {
          console.error(
            `[RuleEngine] Trigger sans action dans ${ownerId}: ${originalId}`,
          );
          return null;
        }
        step.when = `ui.${scopedId}`;
      }

      const actions = Array.isArray(step.do) ? step.do : [step.do];
      for (const action of actions) {
        if (!V2_EFFECTS.has(action.action)) {
          console.error(
            `[RuleEngine] Effet hors catalogue dans ${ownerId}: ${action.action}`,
          );
          return null;
        }
        if (
          action.action === "cooldown.set" &&
          typeof action.params?.actionId === "string"
        ) {
          const scopedId = actionIds.get(action.params.actionId);
          if (!scopedId) {
            console.error(
              `[RuleEngine] Cooldown sans action dans ${ownerId}: ${action.params.actionId}`,
            );
            return null;
          }
          action.params.actionId = scopedId;
        }
      }
    }

    if (!rule.state?.namespace) {
      console.error(`[RuleEngine] Namespace absent dans ${ownerId}.`);
      return null;
    }
    rule.state.namespace = `${rule.state.namespace}::${ownerId}`;
    return rule;
  }

  onEnterTile(pieceId: PieceID, to: Tile): void {
    this.dispatchLifecycle("lifecycle.onEnterTile", {
      pieceId,
      to,
      targetTile: to,
    });
  }

  onMoveCommitted(move: { pieceId: PieceID; from: Tile; to: Tile }): void {
    this.dispatchLifecycle("lifecycle.onMoveCommitted", {
      ...move,
      targetTile: move.to,
    });
  }

  onUndo(): void {
    this.dispatchLifecycle("lifecycle.onUndo", {});
  }

  onPromote(pieceId: PieceID, fromType: string, toType: string): void {
    this.dispatchLifecycle("lifecycle.onPromote", {
      pieceId,
      fromType,
      toType,
    });
  }

  onTurnStart(side: Side): void {
    this.engine.cooldown.tickAll();

    const systemBudget = new RuntimeBudget(
      this.options.maxEffectsPerRuleEvent,
      this.options.maxNestedDepth,
    );
    const systemContext: EngineContext = {
      engine: this.engine,
      event: "system.statusTick",
      side,
      state: {},
      params: { side },
      random: createDeterministicRandom(
        `${this.options.matchSeed}|system|${this.eventSequence}`,
      ),
      budget: systemBudget,
      turnEnded: false,
    };

    try {
      this.registry.runEffect(
        {
          action: "status.tickAll",
          params: { side },
        },
        systemContext,
      );
    } catch (error) {
      this.reportRuntimeError(error);
    }

    this.dispatchLifecycle("lifecycle.onTurnStart", { side });
  }

  runUIAction(
    actionId: string,
    pieceId?: PieceID,
    targetTile?: Tile,
  ): RuleActionExecutionResult {
    const action = this.uiActions.find(
      (candidate) => candidate.id === actionId,
    );
    const rule = this.actionOwners.get(actionId);

    if (!action || !rule) {
      return this.rejectUIAction(`Action inconnue: ${actionId}`);
    }

    const effectivePieceId =
      isRuleArchitectRule(rule) &&
      action.availability?.requiresSelection !== true
        ? undefined
        : pieceId;

    let piece: Piece | null = null;
    if (effectivePieceId) {
      try {
        piece = this.engine.board.getPiece(effectivePieceId);
      } catch {
        return this.rejectUIAction("La pièce sélectionnée n'existe plus.");
      }
    }

    if (action.availability?.requiresSelection && !piece) {
      return this.rejectUIAction("Sélectionne d'abord une pièce.");
    }

    const allowedPieces = action.availability?.pieceTypes ?? [];
    if (
      piece &&
      allowedPieces.length > 0 &&
      !allowedPieces.includes("any") &&
      !allowedPieces.includes(piece.type)
    ) {
      return this.rejectUIAction(
        "Cette action n'est pas disponible pour cette pièce.",
      );
    }

    const actionSide = piece?.side ?? this.engine.match.get().turnSide;
    const allowedSides = rule.scope?.sides ?? [];
    if (
      allowedSides.length > 0 &&
      (!isSide(actionSide) || !allowedSides.includes(actionSide))
    ) {
      return this.rejectUIAction("Cette règle ne s'applique pas à ce camp.");
    }

    let targetPieceId: PieceID | undefined;
    if (targetTile) {
      targetPieceId = this.engine.board.getPieceAt(targetTile) ?? undefined;
    }

    const targetingMode = action.targeting?.mode ?? "none";
    if (isRuleArchitectRule(rule) && targetingMode !== "none" && !targetTile) {
      return this.rejectUIAction("Choisis une cible valide.");
    }

    if (
      isRuleArchitectRule(rule) &&
      targetingMode === "piece" &&
      !targetPieceId
    ) {
      return this.rejectUIAction("Cette action exige une pièce cible.");
    }

    const sequence = this.eventSequence + 1;
    const budget = new RuntimeBudget(
      this.options.maxEffectsPerRuleEvent,
      this.options.maxNestedDepth,
    );
    const context = this.buildContext(
      {
        event: `ui.${actionId}`,
        pieceId: effectivePieceId,
        side: actionSide,
        targetTile,
        targetPieceId,
        baseActionId: actionId,
      },
      rule,
      sequence,
      budget,
    );

    const provider = action.targeting?.validTilesProvider;
    if (provider && (isRuleArchitectRule(rule) || targetTile !== undefined)) {
      try {
        const provided = this.registry.runProvider(provider, context);
        const candidates = Array.isArray(provided) ? provided : [];
        const targetIsValid =
          (targetTile !== undefined && candidates.includes(targetTile)) ||
          (targetPieceId !== undefined && candidates.includes(targetPieceId));

        if (!targetIsValid) {
          return this.rejectUIAction(
            "Cette cible n'est pas autorisée par la règle.",
          );
        }
      } catch (error) {
        this.reportRuntimeError(error);
        return {
          ok: false,
          reason: "La cible n'a pas pu être validée en toute sécurité.",
        };
      }
    }

    if (
      effectivePieceId &&
      action.cooldown?.perPiece &&
      action.cooldown.perPiece > 0 &&
      !this.engine.cooldown.isReady(effectivePieceId, actionId)
    ) {
      return this.rejectUIAction("Cette action est encore en recharge.");
    }

    if (
      effectivePieceId &&
      action.maxPerPiece &&
      action.maxPerPiece > 0 &&
      this.getActionUsage(rule, effectivePieceId, actionId) >=
        action.maxPerPiece
    ) {
      return this.rejectUIAction(
        "La limite d'utilisation est atteinte pour cette pièce.",
      );
    }

    this.eventSequence = sequence;

    const outcome = this.evaluateLogicBlock(
      `ui.${actionId}`,
      context,
      rule.logic?.effects,
      () => {
        if (effectivePieceId) {
          this.incrementActionUsage(rule, effectivePieceId, actionId);
          const cooldownTurns = action.cooldown?.perPiece ?? 0;
          if (cooldownTurns > 0) {
            this.engine.cooldown.set(
              effectivePieceId,
              actionId,
              cooldownTurns,
            );
          }
        }
        if (action.consumesTurn) context.turnEnded = true;
      },
    );

    if (outcome.blocked || outcome.executed === 0) {
      if (outcome.executed === 0 && !outcome.blocked) {
        return this.rejectUIAction(
          "Aucun effet jouable n'est associé à cette action.",
        );
      }
      return {
        ok: false,
        reason: "L'action a été refusée par le moteur de règles.",
      };
    }

    return { ok: true };
  }

  getRules(): RuleJSON[] {
    return this.rules.map(cloneRule);
  }

  getUIActions(): UIActionSpec[] {
    return this.uiActions.map(
      (action) => JSON.parse(JSON.stringify(action)) as UIActionSpec,
    );
  }

  private dispatchLifecycle(
    eventId: string,
    base: Record<string, unknown>,
  ): void {
    const sequence = ++this.eventSequence;

    for (const rule of this.rules) {
      const budget = new RuntimeBudget(
        this.options.maxEffectsPerRuleEvent,
        this.options.maxNestedDepth,
      );
      const context = this.buildContext(
        { ...base, event: eventId },
        rule,
        sequence,
        budget,
      );
      if (!this.lifecycleScopeAllows(rule, context)) {
        continue;
      }
      const outcome = this.evaluateLogicBlock(
        eventId,
        context,
        rule.logic?.effects,
      );

      if (outcome.blocked) {
        break;
      }
    }
  }

  private evaluateLogicBlock(
    eventId: string,
    context: EngineContext,
    steps?: LogicStep[],
    onLogicalSuccess?: () => void,
  ): EvaluationOutcome {
    const outcome: EvaluationOutcome = {
      blocked: false,
      executed: 0,
      turnEnded: false,
    };

    if (!steps) {
      return outcome;
    }

    const candidates = steps
      .filter((step) => step.when === eventId || step.when === "always")
      .sort(
        (left, right) =>
          (right.priority ?? 0) - (left.priority ?? 0) ||
          left.id.localeCompare(right.id),
      );
    if (candidates.length === 0) return outcome;

    for (const step of candidates) {
      const rawActions = Array.isArray(step.do) ? step.do : [step.do];
      const actions = this.normaliseActions(step.do);
      const invalidAction = actions.find(
        (action) =>
          !this.registry.effects.has(action.action) ||
          BLOCKED_LEGACY_EFFECTS.has(action.action),
      );
      if (
        rawActions.length === 0 ||
        actions.length !== rawActions.length ||
        invalidAction
      ) {
        console.error(
          `[RuleEngine] Bloc refusé avant exécution : effet invalide ${
            invalidAction?.action ?? "(forme inconnue)"
          }.`,
        );
        if (step.message) this.engine.ui.toast(step.message);
        outcome.blocked = true;
        return outcome;
      }
    }

    let snapshot: MutableEngineSnapshot;
    try {
      snapshot = this.captureMutableState(context.rule as RuleJSON, context);
    } catch (error) {
      this.reportRuntimeError(error);
      outcome.blocked = true;
      return outcome;
    }

    context.postCommit = [];
    let failureMessage: string | undefined;

    try {
      for (const step of candidates) {
        const conditions = this.normaliseConditions(step.if);
        const passes = conditions.every((condition) =>
          this.registry.runCondition(condition, context),
        );

        if (!passes) {
          if (step.onFail === "blockAction") {
            if (step.message) {
              failureMessage = step.message;
            }
            outcome.blocked = true;
            break;
          }
          continue;
        }

        const actions = this.normaliseActions(step.do);
        for (const action of actions) {
          const succeeded = this.registry.runEffect(action, context);
          if (!succeeded) {
            failureMessage = step.message;
            outcome.blocked = true;
            break;
          } else {
            outcome.executed += 1;
          }
        }

        if (outcome.blocked) break;
      }
      if (!outcome.blocked && outcome.executed > 0) {
        onLogicalSuccess?.();
      }
    } catch (error) {
      this.reportRuntimeError(error);
      outcome.blocked = true;
    }

    if (outcome.blocked) {
      try {
        this.restoreMutableState(snapshot);
      } catch (error) {
        this.reportRuntimeError(error);
      }
      context.postCommit.length = 0;
      context.turnEnded = false;
      outcome.executed = 0;
      if (failureMessage) this.engine.ui.toast(failureMessage);
      return outcome;
    }

    outcome.turnEnded = context.turnEnded === true;
    if (outcome.turnEnded && outcome.executed > 0) {
      try {
        this.engine.match.endTurn();
      } catch (error) {
        try {
          this.restoreMutableState(snapshot);
        } catch (restoreError) {
          this.reportRuntimeError(restoreError);
        }
        context.postCommit.length = 0;
        context.turnEnded = false;
        outcome.blocked = true;
        outcome.executed = 0;
        this.reportRuntimeError(error);
        return outcome;
      }
    }

    for (const callback of context.postCommit) {
      try {
        callback();
      } catch (error) {
        console.error("[RuleEngine] Effet visuel post-commit ignoré:", error);
      }
    }
    context.postCommit.length = 0;
    return outcome;
  }

  private captureMutableState(
    rule: RuleJSON,
    context: EngineContext,
  ): MutableEngineSnapshot {
    const boardCanSnapshot =
      typeof this.engine.board.serialize === "function" &&
      typeof this.engine.board.deserialize === "function";
    if (
      isRuleArchitectRule(rule) &&
      (!boardCanSnapshot || context.statePersistenceValid === false)
    ) {
      throw new Error(
        "Adaptateurs transactionnels requis pour une règle Rule Architect.",
      );
    }

    return {
      board: boardCanSnapshot ? this.engine.board.serialize!() : null,
      cooldown: this.engine.cooldown.serialize(),
      state: this.engine.state.serialize(),
    };
  }

  private restoreMutableState(snapshot: MutableEngineSnapshot): void {
    const failures: unknown[] = [];
    const restore = (callback: () => void) => {
      try {
        callback();
      } catch (error) {
        failures.push(error);
      }
    };

    if (snapshot.board !== null) {
      restore(() => this.engine.board.deserialize!(snapshot.board!));
    }
    restore(() => this.engine.cooldown.deserialize(snapshot.cooldown));
    restore(() => this.engine.state.deserialize(snapshot.state));

    if (failures.length > 0) {
      throw new RuleRollbackError(failures);
    }
  }

  private normaliseConditions(
    input: Condition | Condition[] | undefined,
  ): ConditionDescriptor[] {
    if (input === undefined) {
      return [];
    }

    if (!Array.isArray(input)) {
      return [input as ConditionDescriptor];
    }

    if (input.length === 0) {
      return [];
    }

    const first = input[0];

    if (first === "not" || first === "and" || first === "or") {
      return [input as ConditionDescriptor];
    }

    const isConditionDescriptor = (
      value: unknown,
    ): value is ConditionDescriptor => {
      if (typeof value === "string") {
        return this.registry.conditions.has(value);
      }

      if (!Array.isArray(value) || value.length === 0) {
        return false;
      }

      const operation = value[0];
      return typeof operation === "string" && operation.length > 0;
    };

    const looksLikeConditionList =
      input.length > 1 && input.every(isConditionDescriptor);

    if (looksLikeConditionList) {
      return input as ConditionDescriptor[];
    }

    if (typeof first === "string" && this.registry.conditions.has(first)) {
      return [input as ConditionDescriptor];
    }

    // Keep unknown descriptors intact: Registry must see them and fail closed.
    return [input as ConditionDescriptor];
  }

  private normaliseActions(input: ActionStep | ActionStep[]): ActionStep[] {
    if (isActionStep(input)) {
      return [input];
    }
    return Array.isArray(input) ? input.filter(isActionStep) : [];
  }

  private buildContext(
    base: Record<string, unknown>,
    rule: RuleJSON,
    sequence: number,
    budget: RuntimeBudget,
  ): EngineContext {
    const pieceId = typeof base.pieceId === "string" ? base.pieceId : undefined;

    let piece: Piece | null = null;
    if (pieceId) {
      try {
        piece = this.engine.board.getPiece(pieceId);
      } catch {
        piece = null;
      }
    }

    const storedRuleState = rule.state?.namespace
      ? this.engine.state.getOrInit(
          rule.state.namespace,
          rule.state.initial ?? {},
        )
      : {};
    const statePersistenceValid = isRecord(storedRuleState);
    const ruleState: Record<string, unknown> = statePersistenceValid
      ? storedRuleState
      : {};

    const event = typeof base.event === "string" ? base.event : "unknown";
    const side =
      base.side === "white" || base.side === "black"
        ? base.side
        : (piece?.side ?? this.engine.match.get().turnSide);

    const seed = [
      this.options.matchSeed,
      sequence,
      rule.meta.ruleId,
      event,
      pieceId ?? "",
      String(base.targetTile ?? ""),
    ].join("|");

    return {
      ...base,
      engine: this.engine,
      registry: this.registry,
      pieceId,
      piece,
      side,
      rule,
      scope: rule.scope,
      params: rule.parameters ?? {},
      state: ruleState,
      statePersistenceValid,
      random: createDeterministicRandom(seed),
      budget,
      turnEnded: false,
    };
  }

  private getActionUsage(
    rule: RuleJSON,
    pieceId: string,
    actionId: string,
  ): number {
    if (!rule.state?.namespace) {
      return 0;
    }

    const state = this.engine.state.getOrInit(
      rule.state.namespace,
      rule.state.initial ?? {},
    );
    if (!isRecord(state)) return 0;
    const usages = state.__ruleArchitectActionUses;
    if (!isRecord(usages)) return 0;
    const value = usages[`${pieceId}:${actionId}`];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private incrementActionUsage(
    rule: RuleJSON,
    pieceId: string,
    actionId: string,
  ): void {
    if (!rule.state?.namespace) {
      return;
    }

    const state = this.engine.state.getOrInit(
      rule.state.namespace,
      rule.state.initial ?? {},
    );
    if (!isRecord(state)) return;
    const currentUsages = state.__ruleArchitectActionUses;
    const usages: Record<string, unknown> = isRecord(currentUsages)
      ? currentUsages
      : (state.__ruleArchitectActionUses = {});
    const key = `${pieceId}:${actionId}`;
    const current = usages[key];
    usages[key] =
      (typeof current === "number" && Number.isFinite(current) ? current : 0) +
      1;
  }

  private lifecycleScopeAllows(
    rule: RuleJSON,
    context: EngineContext,
  ): boolean {
    const event = context.event;
    const requiresSourcePiece =
      event === "lifecycle.onEnterTile" ||
      event === "lifecycle.onMoveCommitted" ||
      event === "lifecycle.onPromote";
    if (requiresSourcePiece && !context.piece) {
      return false;
    }

    const sides = rule.scope?.sides ?? [];
    const side = context.side;
    if (
      sides.length > 0 &&
      ((side !== "white" && side !== "black") || !sides.includes(side))
    ) {
      return false;
    }

    const affectedPieces = rule.scope?.affectedPieces ?? [];
    if (
      affectedPieces.length === 0 ||
      affectedPieces.includes("any") ||
      affectedPieces.includes("all")
    ) {
      return true;
    }

    const scopedPieceType =
      event === "lifecycle.onPromote" && typeof context.fromType === "string"
        ? context.fromType
        : context.piece?.type;

    // Turn-start and undo events intentionally have no source piece. Their
    // side scope still applies, while piece-specific effects remain protected
    // by their own required piece parameters/conditions.
    if (!scopedPieceType) {
      return event === "lifecycle.onTurnStart" || event === "lifecycle.onUndo";
    }
    return affectedPieces.includes(scopedPieceType);
  }

  private rejectUIAction(reason: string): RuleActionExecutionResult {
    this.engine.ui.toast(reason);
    return { ok: false, reason };
  }

  private reportRuntimeError(error: unknown): void {
    if (error instanceof RuntimeBudgetExceededError) {
      console.error("[RuleEngine] Budget d'exécution dépassé:", error);
      this.engine.ui.toast(
        "La règle a été stoppée car elle dépassait le budget de sécurité.",
      );
      return;
    }

    console.error("[RuleEngine] Erreur d'exécution:", error);
    this.engine.ui.toast(
      "La règle n'a pas pu être exécutée en toute sécurité.",
    );
  }
}
