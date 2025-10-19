import type { RuleJSON } from "@/engine/types";
import type { CanonicalIntent } from "../schemas/canonicalIntent";

export type DryRunIssue = {
  code: string;
  message: string;
};

export type DryRunResult = {
  passed: boolean;
  issues: DryRunIssue[];
};

const ACTIONS_REQUIRING_TILE = new Set([
  "piece.teleport",
  "piece.move",
  "hazard.spawn",
]);

export const dryRunRule = (
  intent: CanonicalIntent,
  rule: RuleJSON,
): DryRunResult => {
  const issues: DryRunIssue[] = [];

  (rule.logic?.effects ?? []).forEach((effect) => {
    const actions = Array.isArray(effect.do)
      ? effect.do
      : effect.do
        ? [effect.do]
        : [];
    actions.forEach((action) => {
      if (ACTIONS_REQUIRING_TILE.has(action.action) && !action.params) {
        issues.push({
          code: "missing_params",
          message: `L'action ${action.action} doit définir des paramètres pour ${effect.id}.`,
        });
      }
    });
  });

  const hasHazard = intent.hazards && intent.hazards.length > 0;
  if (hasHazard) {
    const spawnsHazard = (rule.logic?.effects ?? []).some((effect) => {
      const actions = Array.isArray(effect.do)
        ? effect.do
        : effect.do
          ? [effect.do]
          : [];
      return actions.some((action) => action.action === "hazard.spawn");
    });
    if (!spawnsHazard) {
      issues.push({
        code: "hazard_missing",
        message:
          "Le intent attend une création de danger mais aucun hazard.spawn n'est présent.",
      });
    }
  }

  return { passed: issues.length === 0, issues };
};
