import type { RuleJSON } from "@/engine/types";
import type { CanonicalIntent } from "../schemas/canonicalIntent";
import { templateCompilers } from "./templates";

export type CompilationWarning = {
  code: string;
  message: string;
};

export const compileIntentToRule = (
  intent: CanonicalIntent,
): { rule: RuleJSON; warnings: CompilationWarning[] } => {
  const compiler = templateCompilers[intent.templateId];
  if (!compiler) {
    return {
      rule: {
        meta: {
          ruleId: `r_${intent.templateId}`,
          ruleName: intent.ruleName,
          category: intent.category ?? "custom",
          isActive: true,
        },
      },
      warnings: [
        {
          code: "missing_compiler",
          message: `Aucun compilateur n'est défini pour le template ${intent.templateId}.`,
        },
      ],
    };
  }

  const rule = compiler(intent);
  return { rule, warnings: [] };
};
