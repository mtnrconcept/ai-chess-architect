import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  requireSupabaseClient: () => ({
    functions: { invoke },
  }),
}));

import {
  buildGuidedRulePrompt,
  buildRuleIntentContract,
  requestRuleGuidance,
  type RuleGuidanceResponse,
} from "./guidance-api";

const guidance: RuleGuidanceResponse = {
  feasibility: "adaptable",
  summary: "Le fou gèle une cible avec une animation adaptée.",
  draftPrompt:
    "Un fou peut geler une pièce ennemie pendant deux tours avec un cooldown.",
  requirements: [
    {
      id: "freeze-target",
      statement: "Le fou gèle une pièce ennemie pendant deux tours.",
      importance: "core",
      feasibility: "direct",
      adaptation: "",
    },
    {
      id: "ice-cinematic",
      statement: "Une cinématique de glace accompagne l’effet.",
      importance: "cosmetic",
      feasibility: "adaptable",
      adaptation: "Utiliser un effet visuel géré.",
    },
  ],
  questions: [
    {
      id: "duration",
      question: "Combien de tours dure le gel ?",
      help: "La durée influence l’équilibrage.",
      selectionMode: "single",
      minSelections: 1,
      maxSelections: 1,
      choices: [
        {
          id: "two-turns",
          label: "Deux tours",
          description: "Durée équilibrée.",
          recommended: true,
        },
        {
          id: "one-turn",
          label: "Un tour",
          description: "Durée courte.",
          recommended: false,
        },
        {
          id: "three-turns",
          label: "Trois tours",
          description: "Durée puissante.",
          recommended: false,
        },
      ],
    },
    {
      id: "cooldown",
      question: "Quel cooldown appliquer ?",
      help: "Le cooldown limite la fréquence.",
      selectionMode: "single",
      minSelections: 1,
      maxSelections: 1,
      choices: [
        {
          id: "three-turns",
          label: "Trois tours",
          description: "Rythme équilibré.",
          recommended: true,
        },
        {
          id: "two-turns",
          label: "Deux tours",
          description: "Rythme rapide.",
          recommended: false,
        },
        {
          id: "four-turns",
          label: "Quatre tours",
          description: "Rythme prudent.",
          recommended: false,
        },
      ],
    },
  ],
  adjustments: [
    {
      id: "managed-ice-effect",
      label: "Effet de glace géré",
      description: "Remplacer la vidéo libre par un effet visuel validé.",
      recommended: true,
      requirementIds: ["ice-cinematic"],
    },
  ],
  remainingUncertainty: [],
  guidanceToken: "signed.guidance",
  model: "gpt-5.6-terra",
};

const selections = {
  duration: ["two-turns"],
  cooldown: ["three-turns"],
};

describe("Rule Architect guidance contract", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("records an adaptation only after explicit acceptance", () => {
    const rejected = buildRuleIntentContract({
      originalPrompt: "Le fou gèle une cible avec une cinématique de glace.",
      guidance,
      selections,
      acceptedAdjustmentIds: new Set(),
    });
    const accepted = buildRuleIntentContract({
      originalPrompt: "Le fou gèle une cible avec une cinématique de glace.",
      guidance,
      selections,
      acceptedAdjustmentIds: new Set(["managed-ice-effect"]),
    });

    expect(rejected.requirements[1].approvedAdaptation).toBe("");
    expect(accepted.requirements[1].approvedAdaptation).toContain(
      "effet visuel validé",
    );
  });

  it("keeps the compile prompt bounded and includes every requirement id", () => {
    const prompt = buildGuidedRulePrompt({
      originalPrompt: "Le fou gèle une cible avec une cinématique de glace.",
      guidance,
      selections,
      acceptedAdjustmentIds: new Set(["managed-ice-effect"]),
    });

    expect(prompt.length).toBeLessThanOrEqual(6000);
    expect(prompt).toContain("freeze-target");
    expect(prompt).toContain("ice-cinematic");
    expect(prompt).toContain(
      "N’adapte que les ajustements explicitement acceptés",
    );
  });

  it("accepts a complete guidance envelope", async () => {
    invoke.mockResolvedValue({
      data: { success: true, data: guidance },
      error: null,
    });

    await expect(
      requestRuleGuidance({ prompt: "Le fou gèle une cible." }),
    ).resolves.toEqual(guidance);
  });

  it("turns invalid selection bounds into a recoverable analysis error", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...guidance,
          questions: guidance.questions.map((question, index) =>
            index === 0
              ? { ...question, maxSelections: question.choices.length + 1 }
              : question,
          ),
        },
      },
      error: null,
    });

    await expect(
      requestRuleGuidance({ prompt: "Le fou gèle une cible." }),
    ).rejects.toThrow("réponse invalide");
  });

  it("rejects a malformed success envelope without leaking raw data", async () => {
    invoke.mockResolvedValue({
      data: { success: "yes", data: guidance },
      error: null,
    });

    await expect(
      requestRuleGuidance({ prompt: "Le fou gèle une cible." }),
    ).rejects.toThrow("Relance l’analyse");
  });
});
