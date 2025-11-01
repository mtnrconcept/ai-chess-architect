import type { RuleJSON } from "@/engine/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const toString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
    : [];

const toRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const toArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const toOptionalRecord = (
  value: unknown,
): Record<string, unknown> | undefined => (isRecord(value) ? value : undefined);

type NormalizedAction = {
  action: string;
  params?: Record<string, unknown>;
};

const normalizeAction = (
  entry: unknown,
  fallbackParams: Record<string, unknown> | undefined,
): NormalizedAction | null => {
  if (typeof entry === "string") {
    const action = entry.trim();
    if (!action) {
      return null;
    }

    if (fallbackParams && Object.keys(fallbackParams).length > 0) {
      return { action, params: fallbackParams };
    }

    return { action };
  }

  if (isRecord(entry)) {
    const action =
      toString(entry.action) ??
      toString(entry.type) ??
      toString(entry.id) ??
      toString(entry.name);

    if (!action) {
      return null;
    }

    const paramsCandidate =
      toOptionalRecord(entry.params) ??
      toOptionalRecord(entry.arguments) ??
      toOptionalRecord(entry.args) ??
      toOptionalRecord(entry.payload) ??
      fallbackParams;

    const params =
      paramsCandidate && Object.keys(paramsCandidate).length > 0
        ? paramsCandidate
        : undefined;

    return params ? { action, params } : { action };
  }

  return null;
};

const normalizeActions = (
  effect: Record<string, unknown>,
): NormalizedAction[] => {
  const fallbackParams = toOptionalRecord(effect.params);
  const collected: NormalizedAction[] = [];

  const pushEntry = (entry: unknown) => {
    const normalized = normalizeAction(entry, fallbackParams);
    if (normalized) {
      collected.push(normalized);
    }
  };

  if (Array.isArray(effect.do)) {
    effect.do.forEach(pushEntry);
  } else if (effect.do !== undefined) {
    pushEntry(effect.do);
  }

  if (Array.isArray(effect.actions)) {
    effect.actions.forEach(pushEntry);
  } else if (effect.actions !== undefined) {
    pushEntry(effect.actions);
  }

  if (collected.length === 0 && effect.action !== undefined) {
    pushEntry(effect.action);
  }

  if (collected.length === 0 && effect.then !== undefined) {
    pushEntry(effect.then);
  }

  return collected;
};

const isRuleJSONLike = (value: Record<string, unknown>): value is RuleJSON =>
  isRecord(value.meta) && 
  isRecord(value.logic) && 
  Array.isArray((value.logic as Record<string, unknown>).effects);

/**
 * Transforme une règle générée par l'IA vers le format attendu par le moteur.
 * Si l'IA génère déjà du RuleJSON valide, on le retourne directement.
 * Sinon, on applique une transformation minimale (fallback).
 *
 * @param aiRule - Règle au format IA
 * @returns Règle au format moteur (RuleJSON)
 */
export function transformAiRuleToEngineRule(input: unknown): RuleJSON {
  const aiRule = asRecord(input);

  // Si l'IA a généré directement du RuleJSON, validation et retour direct
  if (isRuleJSONLike(aiRule)) {
    return aiRule;
  }

  // Fallback minimal si format ancien
  const metaRecord = toRecord(aiRule.meta);
  const scopeRecord = toRecord(aiRule.scope);
  const legacyRuleId = toString(metaRecord.ruleId) ?? toString(aiRule.ruleId);
  const legacyRuleName =
    toString(metaRecord.ruleName) ?? toString(aiRule.ruleName);
  const legacyDescription =
    toString(metaRecord.description) ?? toString(aiRule.description);
  const legacyCategory =
    toString(metaRecord.category) ?? toString(aiRule.category);
  const legacyPriority =
    typeof metaRecord.priority === "number"
      ? metaRecord.priority
      : typeof aiRule.priority === "number"
        ? aiRule.priority
        : undefined;
  const legacyTags = toStringArray(metaRecord.tags ?? aiRule.tags);

  const fallbackRuleId = legacyRuleId ?? `rule_${Date.now()}`;
  const fallbackRuleName = legacyRuleName ?? "Règle sans nom";
  const fallbackDescription = legacyDescription ?? "";

  const affectedPieces = toStringArray(
    scopeRecord.affectedPieces ?? aiRule.affectedPieces,
  );

  const rawLogic = toRecord(aiRule.logic);
  const rawEffects = toArray<Record<string, unknown>>(
    rawLogic.effects ?? aiRule.effects,
  );
  const parameters = toRecord(aiRule.parameters ?? aiRule.settings);
  const assets = aiRule.assets ?? aiRule.visuals;
  const stateRecord = toOptionalRecord(aiRule.state);
  const stateInitial = toOptionalRecord(stateRecord?.initial);

  const effects = rawEffects.map((rawEffect: unknown, index: number) => {
    const effectRecord = toRecord(rawEffect);
    const actions = normalizeActions(effectRecord);

    const whenValue =
      toString(effectRecord.when) ??
      toString(effectRecord.trigger) ??
      toString(effectRecord.phase) ??
      "onAction";

    const idValue =
      toString(effectRecord.id) ??
      toString(effectRecord.name) ??
      `${fallbackRuleId}-effect-${index}`;

    const conditionValue =
      effectRecord.if ?? effectRecord.condition ?? effectRecord.conditions;

    const normalized: Record<string, unknown> = {
      id: idValue,
      when: whenValue,
      do: actions.length === 1 ? actions[0] : actions.length > 1 ? actions : [],
    };

    if (typeof conditionValue === "string" || Array.isArray(conditionValue)) {
      normalized.if = conditionValue;
    }

    if (typeof effectRecord.message === "string") {
      normalized.message = effectRecord.message;
    }

    const onFail = toString(effectRecord.onFail);
    if (onFail === "skip" || onFail === "blockAction") {
      normalized.onFail = onFail;
    }

    return normalized;
  });

  return {
    meta: {
      ruleId: fallbackRuleId,
      ruleName: fallbackRuleName,
      description: fallbackDescription,
      category: legacyCategory ?? "ai-generated",
      version: "1.0.0",
      isActive: true,
      tags: legacyTags,
      ...(legacyPriority !== undefined ? { priority: legacyPriority } : {}),
    },
    scope: {
      affectedPieces,
      sides: ["white", "black"],
    },
    logic: {
      effects: effects as any, // Type assertion needed for dynamic effects
    },
    state: {
      namespace: `rules.${fallbackRuleId}`,
      initial: stateInitial ?? {},
    },
    parameters,
    assets: toOptionalRecord(assets) ?? assets,
  };
}

/**
 * Valide qu'une règle RuleJSON contient des actions connues.
 *
 * @param ruleJSON - Règle à valider
 * @returns Liste des actions inconnues (vide si tout est valide)
 */
export function validateRuleJSONActions(ruleJSON: RuleJSON): string[] {
  const knownActions = [
    "audio.play",
    "board.areaEffect",
    "board.capture",
    "cooldown.set",
    "decal.clear",
    "decal.set",
    "hazard.clear",
    "hazard.explode",
    "hazard.resolve",
    "hazard.spawn",
    "hazard.tick",
    "piece.capture",
    "piece.clearStatus",
    "piece.duplicate",
    "piece.move",
    "piece.setInvisible",
    "piece.setStatus",
    "piece.spawn",
    "state.delete",
    "state.inc",
    "state.pushUndo",
    "state.set",
    "status.add",
    "status.remove",
    "status.tickAll",
    "tile.clearTrap",
    "tile.resolveTrap",
    "tile.setTrap",
    "turn.end",
    "ui.toast",
    "vfx.play",
    "projectile.spawn",
    "area.forEachTile",
    "composite",
  ];

  const unknownActions: string[] = [];

  // Safely handle missing or empty effects array
  const effects = ruleJSON?.logic?.effects;
  if (!Array.isArray(effects)) {
    return unknownActions;
  }

  effects.forEach((effect) => {
    const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
    actions.forEach((action) => {
      if (action && typeof action.action === 'string' && !knownActions.includes(action.action)) {
        unknownActions.push(action.action);
      }
    });
  });

  return [...new Set(unknownActions)];
}
