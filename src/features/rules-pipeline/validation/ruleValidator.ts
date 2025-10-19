import type { RuleJSON } from "@/engine/types";
import type { CanonicalIntent } from "../schemas/canonicalIntent";

export type ValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

const needsKingSafety = (intent: CanonicalIntent) =>
  intent.requirements?.kingSafety ||
  intent.mechanics.some((mechanic) =>
    [
      "teleport",
      "swap",
      "morph",
      "projectile",
      "piece.move",
      "piece.capture",
    ].some((keyword) => mechanic.includes(keyword)),
  );

export const validateRule = (
  intent: CanonicalIntent,
  rule: RuleJSON,
): { issues: ValidationIssue[]; isValid: boolean } => {
  const issues: ValidationIssue[] = [];

  if (!rule.meta?.ruleName) {
    issues.push({
      code: "missing_meta",
      message: "Le rule JSON doit définir meta.ruleName.",
      severity: "error",
    });
  }

  if (!rule.scope?.affectedPieces || rule.scope.affectedPieces.length === 0) {
    issues.push({
      code: "missing_scope",
      message:
        "Les pièces affectées doivent être précisées dans scope.affectedPieces.",
      severity: "error",
    });
  }

  if (
    rule.scope?.affectedPieces &&
    intent.affectedPieces.some(
      (piece) => !rule.scope?.affectedPieces?.includes(piece),
    )
  ) {
    issues.push({
      code: "scope_mismatch",
      message:
        "Certaines pièces du intent ne figurent pas dans la règle générée.",
      severity: "error",
    });
  }

  if (needsKingSafety(intent)) {
    const hasKingSafety = (rule.logic?.effects ?? []).some((effect) => {
      const conditions = Array.isArray(effect.if)
        ? effect.if
        : effect.if
          ? [effect.if]
          : [];
      return conditions.some(
        (condition) =>
          Array.isArray(condition) && condition[0] === "rules.kingSafeAfter",
      );
    });
    if (!hasKingSafety) {
      issues.push({
        code: "missing_king_safety",
        message:
          "Les effets associés doivent inclure le garde-fou rules.kingSafeAfter.",
        severity: "error",
      });
    }
  }

  if (intent.limits?.oncePerMatch) {
    const usesResource = (rule.logic?.effects ?? []).some((effect) => {
      const steps = Array.isArray(effect.do)
        ? effect.do
        : effect.do
          ? [effect.do]
          : [];
      return steps.some((step) => step.action === "resource.markUsed");
    });
    if (!usesResource) {
      issues.push({
        code: "missing_resource_guard",
        message: "Une limite oncePerMatch requiert resource.markUsed.",
        severity: "warning",
      });
    }
  }

  const isValid = issues.every((issue) => issue.severity !== "error");
  return { issues, isValid };
};
