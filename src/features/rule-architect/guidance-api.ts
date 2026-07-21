import { FunctionsHttpError } from "@supabase/supabase-js";
import { requireSupabaseClient } from "@/integrations/supabase/client";

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
}

export interface RuleGuidanceResponse {
  feasibility: RuleGuidanceFeasibility;
  summary: string;
  draftPrompt: string;
  questions: RuleGuidanceQuestion[];
  adjustments: RuleGuidanceAdjustment[];
  remainingUncertainty: string[];
  model: string;
}

type GuidanceEnvelope = {
  success?: boolean;
  error?: string;
  data?: RuleGuidanceResponse;
};

const readFunctionError = async (error: unknown): Promise<string> => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = (await error.context.clone().json()) as GuidanceEnvelope;
      if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
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

  const envelope = data as GuidanceEnvelope | null;
  if (!envelope?.success || !envelope.data) {
    throw new Error(envelope?.error || "Analyse de la règle incomplète.");
  }

  return envelope.data;
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

  return [
    input.guidance.draftPrompt.trim() || input.originalPrompt.trim(),
    answers.length > 0
      ? `\nDécisions confirmées par l’utilisateur :\n- ${answers.join("\n- ")}`
      : "",
    adjustments.length > 0
      ? `\nAjustements acceptés pour rendre la variante jouable :\n- ${adjustments.join("\n- ")}`
      : "",
    "\nPréserve l’intention originale. Lorsque deux décisions se contredisent, privilégie les choix confirmés ci-dessus. Produis une variante jouable avec limites, contre-jeu et exemples concrets.",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
}
