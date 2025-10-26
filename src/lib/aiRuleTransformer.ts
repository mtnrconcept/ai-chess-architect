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

const isRuleJSONLike = (value: Record<string, unknown>): value is RuleJSON =>
  isRecord(value.meta) && isRecord(value.logic);

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
  const fallbackRuleId = toString(aiRule.ruleId) ?? `rule_${Date.now()}`;
  const fallbackRuleName = toString(aiRule.ruleName) ?? "Règle sans nom";
  const fallbackDescription = toString(aiRule.description) ?? "";
  const fallbackTags = toStringArray(aiRule.tags);
  const affectedPieces = toStringArray(aiRule.affectedPieces);
  const effects = toArray<Record<string, unknown>>(aiRule.effects);
  const parameters = toRecord(aiRule.parameters);
  const assets = aiRule.visuals ?? aiRule.assets;

  return {
    meta: {
      ruleId: fallbackRuleId,
      ruleName: fallbackRuleName,
      description: fallbackDescription,
      category: "ai-generated",
      version: "1.0.0",
      isActive: true,
      tags: fallbackTags,
    },
    scope: {
      affectedPieces,
      sides: ["white", "black"],
    },
    logic: {
      effects,
    },
    state: {
      namespace: `rules.${fallbackRuleId}`,
      initial: {},
    },
    parameters,
    assets,
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
    "area.forEachTile",
    "composite",
  ];

  const unknownActions: string[] = [];

  ruleJSON.logic.effects.forEach((effect) => {
    const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
    actions.forEach((action) => {
      if (!knownActions.includes(action.action)) {
        unknownActions.push(action.action);
      }
    });
  });

  return [...new Set(unknownActions)];
}
