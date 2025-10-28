import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleGeneratorChatMessage } from "./functions";

const pipelineMock = vi.fn();

vi.mock("@/features/rules-pipeline", () => ({
  generateRulePipeline: pipelineMock,
}));

const buildPipelineResult = () => ({
  program: {},
  programWarnings: [],
  intent: {},
  factoryWarnings: [],
  rule: {
    meta: { ruleId: "fallback", ruleName: "Fallback Rule" },
    logic: { effects: [] },
    scope: {},
    state: { namespace: "rules.fallback", initial: {} },
  },
  compilationWarnings: [],
  validation: { issues: [], isValid: true },
  dryRun: { passed: true, issues: [] },
  plan: [],
  fallbackProvider: undefined,
});

describe("invokeRuleGeneratorChat", () => {
  beforeEach(() => {
    pipelineMock.mockReset();
    pipelineMock.mockReturnValue(buildPipelineResult());
  });

  it("throws when the conversation array is missing", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    await expect(
      // @ts-expect-error - intentionally missing conversation
      invokeRuleGeneratorChat({ prompt: "Hello" }),
    ).rejects.toThrow("conversation manquante");
  });

  it("throws when the sanitized conversation is empty", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    await expect(
      invokeRuleGeneratorChat({
        prompt: "Hello",
        conversation: [
          { role: "assistant", content: " " },
          // Empty content should be filtered out entirely
        ] as RuleGeneratorChatMessage[],
      }),
    ).rejects.toThrow("conversation vide");
  });

  it("prefers the explicit prompt when extracting instructions", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    await invokeRuleGeneratorChat({
      prompt: "Construis une règle pour les cavaliers",
      conversation: [{ role: "user", content: "Utilise des chevaliers" }],
    });

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledWith(
      "Construis une règle pour les cavaliers",
      { forceFallback: true },
    );
  });

  it("falls back to the last user message when no prompt is provided", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    await invokeRuleGeneratorChat({
      conversation: [
        { role: "assistant", content: "Je suis prêt" },
        { role: "user", content: "Transforme les pions en mines" },
      ],
    });

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock).toHaveBeenCalledWith("Transforme les pions en mines", {
      forceFallback: true,
    });
  });

  it("returns a ready result built from the heuristic pipeline", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    const result = await invokeRuleGeneratorChat({
      conversation: [
        { role: "user", content: "Ajoute un blink pour les fous" },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.provider).toBe("local-pipeline");
      expect(result.rule).toHaveProperty("meta.ruleId", "fallback");
      expect(result.prompt).toBe("Ajoute un blink pour les fous");
      expect(result.rawModelResponse?.source).toBe("local-pipeline");
      expect(result.rawModelResponse?.cause).toBe("heuristic-only");
    }
  });

  it("propagates pipeline failures with a descriptive error", async () => {
    pipelineMock.mockImplementation(() => {
      throw new Error("Pipeline crash");
    });

    const { invokeRuleGeneratorChat } = await import("./functions");

    await expect(
      invokeRuleGeneratorChat({
        conversation: [{ role: "user", content: "Décris une règle" }],
      }),
    ).rejects.toThrow(/pipeline heuristique a échoué/);
  });
});
