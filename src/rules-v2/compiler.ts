import {
  CONDITION_CATALOG,
  EFFECT_CATALOG,
  PROVIDER_CATALOG,
  SAFE_TOKENS,
  STATE_PATH_PATTERN,
  type ArgumentSpec,
  type OperationSpec,
} from "./catalog";
import { validateBlueprintShape } from "./schema";
import {
  ENGINE_VERSION,
  RULE_SCHEMA_VERSION,
  type BlueprintCondition,
  type BlueprintEffect,
  type CompilationMetrics,
  type CompilationResult,
  type LegacyRuleJSON,
  type RuleArgument,
  type RuleBlueprintV2,
  type RuleDiagnostic,
} from "./types";

const emptyMetrics = (): CompilationMetrics => ({
  riskScore: 100,
  balanceScore: 0,
  complexity: "high",
  triggerCount: 0,
  effectCount: 0,
  actionCount: 0,
});

const BOARD_TILE_PATTERN = /^[a-h][1-8]$/;
const STATUS_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;
const ASSET_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const ACTION_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

const PIECE_REFERENCE_TOKENS = new Set([
  "$pieceId",
  "$targetPieceId",
  "$ctx.pieceId",
  "$ctx.targetPieceId",
]);

const TILE_REFERENCE_TOKENS = new Set([
  "$targetTile",
  "$sourceTile",
  "$ctx.to",
  "$ctx.from",
  "$ctx.targetTile",
]);

const SIDE_REFERENCE_TOKENS = new Set(["$ctx.side"]);

const SPAWNABLE_PIECES = new Set(["pawn", "knight", "bishop", "rook", "queen"]);

const PROMOTION_PIECES = new Set(["knight", "bishop", "rook", "queen"]);

function argumentValue(argument: RuleArgument): unknown {
  switch (argument.kind) {
    case "string":
      return argument.stringValue;
    case "number":
      return argument.numberValue;
    case "boolean":
      return argument.booleanValue;
    case "string_list":
      return [...argument.stringListValue];
    case "token":
      return argument.stringValue;
    default:
      return undefined;
  }
}

function pushDiagnostic(
  diagnostics: RuleDiagnostic[],
  code: string,
  severity: RuleDiagnostic["severity"],
  path: string,
  message: string,
): void {
  diagnostics.push({ code, severity, path, message });
}

function kindMatches(argument: RuleArgument, spec: ArgumentSpec): boolean {
  if (spec.kind === "scalar") {
    return (
      argument.kind === "string" ||
      argument.kind === "number" ||
      argument.kind === "boolean" ||
      argument.kind === "token"
    );
  }
  return argument.kind === spec.kind;
}

function validateSemanticArgument(
  operation: string,
  argument: RuleArgument,
  value: unknown,
  path: string,
  diagnostics: RuleDiagnostic[],
): boolean {
  const fail = (code: string, message: string): false => {
    pushDiagnostic(diagnostics, code, "error", path, message);
    return false;
  };

  if (argument.name === "pieceId" || argument.name === "sourceId") {
    if (
      argument.kind !== "token" ||
      typeof value !== "string" ||
      !PIECE_REFERENCE_TOKENS.has(value)
    ) {
      return fail(
        "PIECE_REFERENCE_REQUIRED",
        `${argument.name} doit utiliser une référence de pièce autorisée.`,
      );
    }
  }

  if (argument.name === "tile" || argument.name === "to") {
    const validLiteral =
      argument.kind === "string" &&
      typeof value === "string" &&
      BOARD_TILE_PATTERN.test(value);
    const validToken =
      argument.kind === "token" &&
      typeof value === "string" &&
      TILE_REFERENCE_TOKENS.has(value);

    if (!validLiteral && !validToken) {
      return fail(
        "TILE_REFERENCE_INVALID",
        `${argument.name} doit être une case a1-h8 ou une référence de case autorisée.`,
      );
    }
  }

  if (argument.name === "side" || argument.name === "owner") {
    const validLiteral =
      argument.kind === "string" && (value === "white" || value === "black");
    const validToken =
      argument.kind === "token" &&
      typeof value === "string" &&
      SIDE_REFERENCE_TOKENS.has(value);

    if (!validLiteral && !validToken) {
      return fail(
        "SIDE_REFERENCE_INVALID",
        `${argument.name} doit valoir white, black ou utiliser $ctx.side.`,
      );
    }
  }

  if (
    operation === "piece.spawn" &&
    argument.name === "type" &&
    (typeof value !== "string" || !SPAWNABLE_PIECES.has(value))
  ) {
    return fail(
      "SPAWN_PIECE_TYPE_INVALID",
      "Le moteur IA ne peut faire apparaître qu'un pion, cavalier, fou, tour ou dame.",
    );
  }

  if (
    operation === "piece.promote" &&
    argument.name === "toType" &&
    (typeof value !== "string" || !PROMOTION_PIECES.has(value))
  ) {
    return fail(
      "PROMOTION_TYPE_INVALID",
      "Une promotion doit produire un cavalier, un fou, une tour ou une dame.",
    );
  }

  if (
    argument.name === "key" &&
    (typeof value !== "string" || !STATUS_KEY_PATTERN.test(value))
  ) {
    return fail(
      "STATUS_KEY_INVALID",
      "La clé de statut doit être un identifiant sûr de 1 à 40 caractères.",
    );
  }

  if (
    argument.name === "actionId" &&
    (typeof value !== "string" || !ACTION_ID_PATTERN.test(value))
  ) {
    return fail(
      "ACTION_ID_INVALID",
      "actionId doit référencer un identifiant d'action du blueprint.",
    );
  }

  if (
    ["sprite", "id", "kind"].includes(argument.name) &&
    (typeof value !== "string" || !ASSET_ID_PATTERN.test(value))
  ) {
    return fail(
      "RESOURCE_ID_INVALID",
      `${argument.name} doit être un identifiant de ressource sûr.`,
    );
  }

  if (
    operation === "tile.setTrap" &&
    argument.name === "kind" &&
    value !== "quicksand"
  ) {
    return fail(
      "TRAP_KIND_INVALID",
      "Le catalogue V2 n'autorise que le piège quicksand.",
    );
  }

  if (
    ["match.turnNumber.atLeast", "match.turnNumber.lessThan"].includes(
      operation,
    ) &&
    argument.name === "value" &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 1000)
  ) {
    return fail(
      "TURN_NUMBER_INVALID",
      "Le numéro de tour doit être un entier compris entre 0 et 1000.",
    );
  }

  if (
    operation === "state.inc" &&
    ["by", "default"].includes(argument.name) &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < -1000 ||
      value > 1000)
  ) {
    return fail(
      "STATE_INCREMENT_INVALID",
      "Les compteurs d'état doivent utiliser des entiers compris entre -1000 et 1000.",
    );
  }

  return true;
}

function validateArguments(
  operation: string,
  args: RuleArgument[],
  spec: OperationSpec,
  path: string,
  diagnostics: RuleDiagnostic[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const declared = new Set(Object.keys(spec.args));

  for (const argument of args) {
    const argumentPath = `${path}.${argument.name}`;
    const expected = spec.args[argument.name];

    if (!expected) {
      pushDiagnostic(
        diagnostics,
        "UNKNOWN_ARGUMENT",
        "error",
        argumentPath,
        `L'opération ${operation} n'accepte pas l'argument ${argument.name}.`,
      );
      continue;
    }

    if (!kindMatches(argument, expected)) {
      pushDiagnostic(
        diagnostics,
        "ARGUMENT_KIND_MISMATCH",
        "error",
        argumentPath,
        `${argument.name} doit être de type ${expected.kind}, pas ${argument.kind}.`,
      );
      continue;
    }

    const value = argumentValue(argument);

    if (
      argument.kind === "token" &&
      (typeof value !== "string" || !SAFE_TOKENS.has(value))
    ) {
      pushDiagnostic(
        diagnostics,
        "UNSAFE_TOKEN",
        "error",
        argumentPath,
        `Le token ${String(value)} n'est pas autorisé.`,
      );
      continue;
    }

    if (
      argument.name === "path" &&
      (typeof value !== "string" || !STATE_PATH_PATTERN.test(value))
    ) {
      pushDiagnostic(
        diagnostics,
        "UNSAFE_STATE_PATH",
        "error",
        argumentPath,
        "Le chemin d'état est invalide ou contient une clé interdite.",
      );
      continue;
    }

    if (
      operation === "random.chance" &&
      argument.name === "percent" &&
      (typeof value !== "number" || value < 0 || value > 100)
    ) {
      pushDiagnostic(
        diagnostics,
        "RANDOM_PERCENT_RANGE",
        "error",
        argumentPath,
        "Le pourcentage doit être compris entre 0 et 100.",
      );
      continue;
    }

    if (
      ["cooldown.set", "status.add"].includes(operation) &&
      ["turns", "duration"].includes(argument.name) &&
      (typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 100)
    ) {
      pushDiagnostic(
        diagnostics,
        "DURATION_RANGE",
        "error",
        argumentPath,
        "La durée doit être un entier compris entre 0 et 100.",
      );
      continue;
    }

    if (
      !validateSemanticArgument(
        operation,
        argument,
        value,
        argumentPath,
        diagnostics,
      )
    ) {
      continue;
    }

    result[argument.name] = value;
    declared.delete(argument.name);
  }

  for (const name of declared) {
    const expected = spec.args[name];
    if (expected.required) {
      pushDiagnostic(
        diagnostics,
        "MISSING_ARGUMENT",
        "error",
        `${path}.${name}`,
        `L'opération ${operation} exige l'argument ${name}.`,
      );
    }
  }

  return result;
}

function compileCondition(
  condition: BlueprintCondition,
  path: string,
  diagnostics: RuleDiagnostic[],
): unknown {
  const params = validateArguments(
    condition.op,
    condition.arguments,
    CONDITION_CATALOG[condition.op],
    path,
    diagnostics,
  );

  const descriptor: unknown =
    Object.keys(params).length === 0 ? condition.op : [condition.op, params];

  return condition.negate ? ["not", descriptor] : descriptor;
}

function compileEffect(
  effect: BlueprintEffect,
  path: string,
  diagnostics: RuleDiagnostic[],
  ruleKey: string,
): { action: BlueprintEffect["op"]; params?: Record<string, unknown> } {
  const params = validateArguments(
    effect.op,
    effect.arguments,
    EFFECT_CATALOG[effect.op],
    path,
    diagnostics,
  );

  if (effect.op === "cooldown.set" && typeof params.actionId === "string") {
    params.actionId = `${ruleKey}.${params.actionId}`;
  }

  return Object.keys(params).length === 0
    ? { action: effect.op }
    : { action: effect.op, params };
}

function analyzeBlueprint(
  blueprint: RuleBlueprintV2,
  diagnostics: RuleDiagnostic[],
): CompilationMetrics {
  const actionIds = new Set(blueprint.actions.map((action) => action.id));
  const actionsById = new Map(
    blueprint.actions.map((action) => [action.id, action]),
  );
  const referencedActions = new Set<string>();
  let effectCount = 0;
  let risk = 0;

  for (const [triggerIndex, trigger] of blueprint.triggers.entries()) {
    const triggerPath = `$.triggers[${triggerIndex}]`;
    effectCount += trigger.effects.length;

    if (trigger.event === "ui.action") {
      if (!trigger.actionId || !actionIds.has(trigger.actionId)) {
        pushDiagnostic(
          diagnostics,
          "UNKNOWN_ACTION_REFERENCE",
          "error",
          `${triggerPath}.actionId`,
          "Un trigger ui.action doit référencer une action existante.",
        );
      } else {
        referencedActions.add(trigger.actionId);
      }
    } else if (trigger.actionId !== "") {
      pushDiagnostic(
        diagnostics,
        "LIFECYCLE_ACTION_REFERENCE",
        "error",
        `${triggerPath}.actionId`,
        "actionId doit être vide pour un événement de cycle de vie.",
      );
    }

    const conditionOps = new Set(
      trigger.conditions.map((condition) => condition.op),
    );
    const referencedAction =
      trigger.event === "ui.action"
        ? actionsById.get(trigger.actionId)
        : undefined;
    const availableTokens = new Set<string>(["$ctx.side"]);

    if (trigger.event === "ui.action") {
      if (referencedAction?.requiresSelection) {
        for (const token of ["$pieceId", "$ctx.pieceId", "$sourceTile"]) {
          availableTokens.add(token);
        }
      }
      if (referencedAction && referencedAction.targetingMode !== "none") {
        availableTokens.add("$targetTile");
        availableTokens.add("$ctx.targetTile");
      }
      if (referencedAction?.targetingMode === "piece") {
        availableTokens.add("$targetPieceId");
        availableTokens.add("$ctx.targetPieceId");
      }
    } else if (
      trigger.event === "lifecycle.onEnterTile" ||
      trigger.event === "lifecycle.onMoveCommitted"
    ) {
      for (const token of [
        "$pieceId",
        "$ctx.pieceId",
        "$sourceTile",
        "$targetTile",
        "$ctx.targetTile",
        "$ctx.to",
      ]) {
        availableTokens.add(token);
      }
      if (trigger.event === "lifecycle.onMoveCommitted") {
        availableTokens.add("$ctx.from");
      }
    } else if (trigger.event === "lifecycle.onPromote") {
      for (const token of ["$pieceId", "$ctx.pieceId", "$sourceTile"]) {
        availableTokens.add(token);
      }
    }

    for (const [effectIndex, effect] of trigger.effects.entries()) {
      for (const [argumentIndex, argument] of effect.arguments.entries()) {
        if (
          argument.kind === "token" &&
          !availableTokens.has(argument.stringValue)
        ) {
          pushDiagnostic(
            diagnostics,
            "TOKEN_UNAVAILABLE_FOR_EVENT",
            "error",
            `${triggerPath}.effects[${effectIndex}].arguments[${argumentIndex}]`,
            `Le token ${argument.stringValue} n'est pas disponible pour ${trigger.event}.`,
          );
        }
      }
    }

    const needsSourcePiece =
      [...conditionOps].some((operation) => operation.startsWith("piece.")) ||
      trigger.effects.some(
        (effect) =>
          effect.op === "piece.promote" &&
          !effect.arguments.some((argument) => argument.name === "pieceId"),
      );
    if (
      needsSourcePiece &&
      ((trigger.event === "ui.action" &&
        !referencedAction?.requiresSelection) ||
        trigger.event === "lifecycle.onTurnStart" ||
        trigger.event === "lifecycle.onUndo")
    ) {
      pushDiagnostic(
        diagnostics,
        "SOURCE_PIECE_UNAVAILABLE",
        "error",
        triggerPath,
        "Ce trigger exige une pièce source, mais son événement n'en fournit pas.",
      );
    }
    const hasTurnGuard =
      conditionOps.has("match.turnNumber.atLeast") ||
      conditionOps.has("match.turnNumber.lessThan") ||
      conditionOps.has("state.lessThan") ||
      conditionOps.has("state.equals");
    const hasTargetTileGuard = conditionOps.has("ctx.hasTargetTile");
    const hasTargetPieceGuard = conditionOps.has("ctx.hasTargetPiece");

    const targetTileTokens = trigger.effects.some((effect) =>
      effect.arguments.some(
        (argument) =>
          argument.kind === "token" &&
          (argument.stringValue === "$targetTile" ||
            argument.stringValue === "$ctx.targetTile"),
      ),
    );
    const targetPieceTokens = trigger.effects.some((effect) =>
      effect.arguments.some(
        (argument) =>
          argument.kind === "token" &&
          (argument.stringValue === "$targetPieceId" ||
            argument.stringValue === "$ctx.targetPieceId"),
      ),
    );

    if (
      targetTileTokens &&
      !hasTargetTileGuard &&
      trigger.event !== "lifecycle.onEnterTile" &&
      trigger.event !== "lifecycle.onMoveCommitted"
    ) {
      pushDiagnostic(
        diagnostics,
        "TARGET_TILE_NOT_GUARDED",
        "error",
        triggerPath,
        "Un effet utilise $targetTile sans condition ctx.hasTargetTile.",
      );
    }

    if (targetPieceTokens && !hasTargetPieceGuard) {
      pushDiagnostic(
        diagnostics,
        "TARGET_PIECE_NOT_GUARDED",
        "error",
        triggerPath,
        "Un effet utilise $targetPieceId sans condition ctx.hasTargetPiece.",
      );
    }

    for (const [effectIndex, effect] of trigger.effects.entries()) {
      if (effect.op !== "cooldown.set") {
        continue;
      }

      const actionArgument = effect.arguments.find(
        (argument) => argument.name === "actionId",
      );
      if (
        actionArgument?.kind === "string" &&
        !actionIds.has(actionArgument.stringValue)
      ) {
        pushDiagnostic(
          diagnostics,
          "UNKNOWN_COOLDOWN_ACTION",
          "error",
          `${triggerPath}.effects[${effectIndex}].arguments.actionId`,
          "Le cooldown doit référencer une action déclarée dans ce blueprint.",
        );
      }
    }

    const turnEndCount = trigger.effects.filter(
      (effect) => effect.op === "turn.end",
    ).length;
    if (turnEndCount > 1) {
      pushDiagnostic(
        diagnostics,
        "MULTIPLE_TURN_END",
        "error",
        triggerPath,
        "Un trigger ne peut pas terminer plusieurs fois le même tour.",
      );
    }

    const highImpactEffects = trigger.effects.filter((effect) =>
      ["piece.spawn", "piece.capture", "piece.promote"].includes(effect.op),
    );

    if (highImpactEffects.length > 0) {
      risk += highImpactEffects.length * 9;
    }

    if (
      trigger.event === "lifecycle.onTurnStart" &&
      highImpactEffects.length > 0 &&
      !hasTurnGuard
    ) {
      risk += 20;
      pushDiagnostic(
        diagnostics,
        "UNBOUNDED_TURN_START_EFFECT",
        "warning",
        triggerPath,
        "Un effet fort est déclenché à chaque début de tour sans garde d'état ou de numéro de tour.",
      );
    }

    if (conditionOps.has("random.chance")) {
      risk += 6;
      pushDiagnostic(
        diagnostics,
        "DETERMINISTIC_RANDOM",
        "info",
        triggerPath,
        "L'aléatoire sera dérivé du seed du match pour rester rejouable.",
      );
    }

    if (trigger.effects.length > 8) {
      risk += 8;
      pushDiagnostic(
        diagnostics,
        "LARGE_EFFECT_BLOCK",
        "warning",
        triggerPath,
        "Ce trigger contient beaucoup d'effets et sera plus difficile à équilibrer.",
      );
    }
  }

  for (const [actionIndex, action] of blueprint.actions.entries()) {
    const actionPath = `$.actions[${actionIndex}]`;
    const providerSpec = PROVIDER_CATALOG[action.validTilesProvider];

    if (!referencedActions.has(action.id)) {
      pushDiagnostic(
        diagnostics,
        "UNUSED_ACTION",
        "warning",
        actionPath,
        "Cette action n'est référencée par aucun trigger ui.action.",
      );
      risk += 2;
    }

    if (
      action.targetingMode !== "none" &&
      action.validTilesProvider === "none"
    ) {
      pushDiagnostic(
        diagnostics,
        "MISSING_TARGET_PROVIDER",
        "error",
        `${actionPath}.validTilesProvider`,
        "Une action ciblée doit déclarer un provider de cibles.",
      );
    }

    if (
      action.targetingMode === "none" &&
      action.validTilesProvider !== "none"
    ) {
      pushDiagnostic(
        diagnostics,
        "UNUSED_TARGET_PROVIDER",
        "warning",
        `${actionPath}.validTilesProvider`,
        "Le provider est ignoré car cette action ne cible rien.",
      );
    }

    if (
      providerSpec &&
      !providerSpec.targetModes.includes(action.targetingMode)
    ) {
      pushDiagnostic(
        diagnostics,
        "TARGET_PROVIDER_TYPE_MISMATCH",
        "error",
        `${actionPath}.validTilesProvider`,
        `Le provider ${action.validTilesProvider} ne produit pas de cibles ${action.targetingMode}.`,
      );
    }

    if (providerSpec?.requiresPiece && !action.requiresSelection) {
      pushDiagnostic(
        diagnostics,
        "TARGET_PROVIDER_REQUIRES_PIECE",
        "error",
        `${actionPath}.requiresSelection`,
        `Le provider ${action.validTilesProvider} exige une pièce source sélectionnée.`,
      );
    }

    if (
      action.cooldownTurns === 0 &&
      action.maxPerPiece === 0 &&
      !action.consumesTurn
    ) {
      risk += 10;
      pushDiagnostic(
        diagnostics,
        "UNLIMITED_FREE_ACTION",
        "warning",
        actionPath,
        "Cette action est gratuite, sans cooldown et sans limite d'utilisation.",
      );
    }
  }

  if (effectCount > 64) {
    pushDiagnostic(
      diagnostics,
      "TOO_MANY_EFFECTS",
      "error",
      "$.triggers",
      "Une règle ne peut pas dépasser 64 effets au total.",
    );
  }

  risk += Math.max(0, blueprint.balance.powerLevel - 3) * 8;
  risk += Math.max(0, blueprint.triggers.length - 6) * 3;
  risk = Math.min(100, Math.max(0, risk));

  const limitations = blueprint.balance.limitations.length;
  const counterplay = blueprint.balance.counterplay.length;
  const declaredBalance =
    100 -
    Math.abs(blueprint.balance.powerLevel - 3) * 14 +
    Math.min(16, limitations * 4) +
    Math.min(16, counterplay * 4);
  const balanceScore = Math.max(
    0,
    Math.min(100, Math.round(declaredBalance - risk * 0.35)),
  );

  const complexityPoints =
    blueprint.actions.length * 2 + blueprint.triggers.length * 3 + effectCount;
  const complexity =
    complexityPoints <= 14 ? "low" : complexityPoints <= 35 ? "medium" : "high";

  return {
    riskScore: risk,
    balanceScore,
    complexity,
    triggerCount: blueprint.triggers.length,
    effectCount,
    actionCount: blueprint.actions.length,
  };
}

export function compileRuleBlueprint(input: unknown): CompilationResult {
  const shape = validateBlueprintShape(input);
  const diagnostics = [...shape.diagnostics];

  if (!shape.value) {
    return {
      ok: false,
      blueprint: null,
      compiledRule: null,
      diagnostics,
      metrics: emptyMetrics(),
    };
  }

  const blueprint = shape.value;
  const metrics = analyzeBlueprint(blueprint, diagnostics);
  const initialState = JSON.parse(blueprint.initialStateJson) as Record<
    string,
    unknown
  >;

  const compiledActions = blueprint.actions.map((action) => {
    const id = `${blueprint.ruleKey}.${action.id}`;
    return {
      id,
      label: action.label,
      hint: action.description,
      availability: {
        requiresSelection: action.requiresSelection,
        pieceTypes: action.pieceTypes,
        cooldownOk: action.cooldownTurns > 0,
      },
      targeting: {
        mode: action.targetingMode,
        ...(action.validTilesProvider !== "none"
          ? { validTilesProvider: action.validTilesProvider }
          : {}),
      },
      consumesTurn: action.consumesTurn,
      cooldown: {
        perPiece: action.cooldownTurns,
      },
      maxPerPiece: action.maxPerPiece,
    };
  });

  const actionMap = new Map(
    blueprint.actions.map((action) => [
      action.id,
      `${blueprint.ruleKey}.${action.id}`,
    ]),
  );

  const compiledSteps = blueprint.triggers.map((trigger, triggerIndex) => {
    const conditions = trigger.conditions.map((condition, conditionIndex) =>
      compileCondition(
        condition,
        `$.triggers[${triggerIndex}].conditions[${conditionIndex}]`,
        diagnostics,
      ),
    );
    const effects = trigger.effects.map((effect, effectIndex) =>
      compileEffect(
        effect,
        `$.triggers[${triggerIndex}].effects[${effectIndex}]`,
        diagnostics,
        blueprint.ruleKey,
      ),
    );

    const when =
      trigger.event === "ui.action"
        ? `ui.${actionMap.get(trigger.actionId) ?? "__invalid_action__"}`
        : trigger.event;

    return {
      id: `${blueprint.ruleKey}.${trigger.id}`,
      when,
      priority: trigger.priority,
      ...(conditions.length === 0
        ? {}
        : {
            if:
              conditions.length === 1 ? conditions[0] : ["and", ...conditions],
          }),
      do: effects,
      onFail: trigger.onFailure,
      ...(trigger.message ? { message: trigger.message } : {}),
    };
  });

  const priority = Math.max(
    0,
    ...blueprint.triggers.map((trigger) => trigger.priority),
  );

  const compiledRule: LegacyRuleJSON = {
    meta: {
      ruleId: `${blueprint.ruleKey}@draft`,
      ruleName: blueprint.title,
      version: RULE_SCHEMA_VERSION,
      description: blueprint.summary,
      category: blueprint.category,
      priority,
      isActive: false,
      tags: blueprint.tags,
    },
    scope: {
      affectedPieces: blueprint.affectedPieces,
      sides: blueprint.sides,
    },
    ui: {
      actions: compiledActions,
    },
    state: {
      namespace: `rules.${blueprint.stateNamespace}`,
      schema: {},
      initial: initialState,
      serialize: true,
    },
    logic: {
      effects: compiledSteps,
    },
    integration: {
      ruleArchitect: {
        schemaVersion: RULE_SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        source: "ai-blueprint",
        blueprintRuleKey: blueprint.ruleKey,
      },
    },
    createdAt: new Date(0).toISOString(),
  };

  const hasErrors = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );

  return {
    ok: !hasErrors,
    blueprint,
    compiledRule: hasErrors ? null : compiledRule,
    diagnostics,
    metrics,
  };
}
