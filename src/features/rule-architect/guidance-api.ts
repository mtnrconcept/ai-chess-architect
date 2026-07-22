import { FunctionsHttpError } from "@supabase/supabase-js";
import { requireSupabaseClient } from "@/integrations/supabase/client";
import {
  functionEnvelopeSchema,
  ruleGuidanceResponseSchema,
} from "./edge-response-schemas";

export type RuleGuidanceSelectionMode = "single" | "multiple";
export type RuleGuidanceFeasibility = "direct" | "adaptable" | "unsupported";

export interface RuleGuidanceChoice {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
}

export interface RuleGuidanceQuestion {
  id: string;
  question: string;
  help: string;
  selectionMode: RuleGuidanceSelectionMode;
  minSelections: number;
  maxSelections: number;
  choices: RuleGuidanceChoice[];
}

export interface RuleGuidanceAdjustment {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  requirementIds: string[];
}

export interface RuleGuidanceRequirement {
  id: string;
  statement: string;
  importance: "core" | "supporting" | "cosmetic";
  feasibility: RuleGuidanceFeasibility;
  adaptation: string;
}

export interface RuleIntentContract {
  version: 1;
  originalPrompt: string;
  requirements: Array<{
    id: string;
    statement: string;
    importance: RuleGuidanceRequirement["importance"];
    feasibility: RuleGuidanceFeasibility;
    approvedAdaptation: string;
  }>;
  decisions: string[];
}

export interface RuleGuidanceResponse {
  feasibility: RuleGuidanceFeasibility;
  summary: string;
  draftPrompt: string;
  requirements: RuleGuidanceRequirement[];
  questions: RuleGuidanceQuestion[];
  adjustments: RuleGuidanceAdjustment[];
  remainingUncertainty: string[];
  guidanceToken: string;
  model: string;
}

export interface RuleGuidanceSelections {
  answers: Record<string, string[]>;
  acceptedAdjustmentIds: string[];
}

const readFunctionError = async (error: unknown): Promise<string> => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = functionEnvelopeSchema.safeParse(
        await error.context.clone().json(),
      );
      if (payload.success && payload.data.error) {
        return payload.data.error;
      }
    } catch {
      // Conserve le message générique ci-dessous.
    }
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : "L’assistant n’a pas pu analyser cette règle.";
};

export async function requestRuleGuidance(input: {
  prompt: string;
  diagnostics?: string[];
}): Promise<RuleGuidanceResponse> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke(
    "generate-rule-questions",
    {
      body: input,
    },
  );

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  const envelope = functionEnvelopeSchema.safeParse(data);
  if (!envelope.success) {
    throw new Error(
      "L’assistant a renvoyé une réponse invalide. Relance l’analyse.",
    );
  }
  if (!envelope.data.success || envelope.data.data === undefined) {
    throw new Error(envelope.data.error || "Analyse de la règle incomplète.");
  }

  const guidance = ruleGuidanceResponseSchema.safeParse(envelope.data.data);
  if (!guidance.success) {
    throw new Error(
      "L’assistant a renvoyé une réponse invalide. Relance l’analyse.",
    );
  }

  return guidance.data as RuleGuidanceResponse;
}

export function buildGuidedRulePrompt(input: {
  originalPrompt: string;
  guidance: RuleGuidanceResponse;
  selections: Record<string, string[]>;
  acceptedAdjustmentIds: Set<string>;
}): string {
  const answers = input.guidance.questions.flatMap((question) => {
    const selected = new Set(input.selections[question.id] ?? []);
    const labels = question.choices
      .filter((choice) => selected.has(choice.id))
      .map((choice) => choice.label);

    return labels.length > 0
      ? [`${question.question} ${labels.join(" ; ")}`]
      : [];
  });

  const adjustments = input.guidance.adjustments
    .filter((adjustment) => input.acceptedAdjustmentIds.has(adjustment.id))
    .map((adjustment) => `${adjustment.label} — ${adjustment.description}`);

  const content = [
    `Contrat de couverture obligatoire :\n- ${input.guidance.requirements
      .map(
        (requirement) =>
          `${requirement.id}: ${requirement.statement.slice(0, 180)}`,
      )
      .join("\n- ")}`,
    answers.length > 0
      ? `\nDécisions confirmées par l’utilisateur :\n- ${answers.join("\n- ")}`
      : "",
    adjustments.length > 0
      ? `\nAjustements acceptés pour rendre la variante jouable :\n- ${adjustments.join("\n- ")}`
      : "",
    `\nCahier des charges proposé :\n${
      input.guidance.draftPrompt.trim() || input.originalPrompt.trim()
    }`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${content.slice(0, 5750)}\nPréserve chaque exigence du contrat. Privilégie les décisions confirmées. N’adapte que les ajustements explicitement acceptés. Produis une variante jouable avec limites, contre-jeu et exemples concrets.`;
}

export function buildRuleIntentContract(input: {
  originalPrompt: string;
  guidance: RuleGuidanceResponse;
  selections: Record<string, string[]>;
  acceptedAdjustmentIds: Set<string>;
}): RuleIntentContract {
  const decisions = input.guidance.questions.flatMap((question) => {
    const selected = new Set(input.selections[question.id] ?? []);
    const labels = question.choices
      .filter((choice) => selected.has(choice.id))
      .map((choice) => choice.label.trim())
      .filter(Boolean);
    return labels.length > 0
      ? [`${question.question.trim()} ${labels.join(" ; ")}`.slice(0, 300)]
      : [];
  });

  return {
    version: 1,
    originalPrompt: input.originalPrompt.trim().slice(0, 6000),
    requirements: input.guidance.requirements.map((requirement) => {
      const approvedAdaptation = input.guidance.adjustments
        .filter(
          (adjustment) =>
            input.acceptedAdjustmentIds.has(adjustment.id) &&
            adjustment.requirementIds.includes(requirement.id),
        )
        .map((adjustment) => adjustment.description.trim())
        .filter(Boolean)
        .join(" ; ")
        .slice(0, 400);

      return {
        id: requirement.id,
        statement: requirement.statement.trim().slice(0, 300),
        importance: requirement.importance,
        feasibility: requirement.feasibility,
        approvedAdaptation,
      };
    }),
    decisions: decisions.slice(0, 20),
  };
}
