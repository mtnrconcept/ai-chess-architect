import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleGeneratorChatMessage } from "./functions";

const pipelineMock = vi.fn();
const supabaseInvokeMock = vi.fn();
const resolveFunctionUrlMock = vi.fn();
const supabaseAuthMock = vi.fn();

vi.mock("@/features/rules-pipeline", () => ({
  generateRulePipeline: pipelineMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  resolveSupabaseFunctionUrl: resolveFunctionUrlMock,
  supabase: {
    functions: { invoke: supabaseInvokeMock },
    auth: { getSession: supabaseAuthMock },
  },
  supabaseAnonKey: "sb_test_anon",
  supabaseDiagnostics: {
    functionsUrl: undefined,
    resolvedProjectId: "test-project",
    resolvedProjectName: "Test",
  },
  supabaseFunctionsUrl: undefined,
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

const buildRemoteReadyResult = (prompt: string) => ({
  status: "ready" as const,
  rule: {
    meta: { ruleId: "remote", ruleName: "Remote Rule" },
    logic: { effects: [] },
  },
  validation: { issues: [], isValid: true },
  dryRun: { passed: true, issues: [] },
  plan: [],
  prompt,
  provider: "groq+heuristic",
});

describe("invokeRuleGeneratorChat", () => {
  beforeEach(() => {
    pipelineMock.mockReset();
    pipelineMock.mockReturnValue(buildPipelineResult());
    supabaseInvokeMock.mockReset();
    supabaseInvokeMock.mockResolvedValue({
      data: { ok: true, result: buildRemoteReadyResult("remote") },
      error: null,
    });
    resolveFunctionUrlMock.mockReset();
    resolveFunctionUrlMock.mockReturnValue(null);
    supabaseAuthMock.mockReset();
    supabaseAuthMock.mockResolvedValue({ data: { session: null } });
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

    expect(supabaseInvokeMock).toHaveBeenCalledTimes(1);
    const call = supabaseInvokeMock.mock.calls[0];
    expect(call?.[0]).toBe("generate-chess-rule");
    expect(call?.[1]).toMatchObject({
      body: expect.objectContaining({
        prompt: "Construis une règle pour les cavaliers",
      }),
    });
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("falls back to the last user message when no prompt is provided", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    await invokeRuleGeneratorChat({
      conversation: [
        { role: "assistant", content: "Je suis prêt" },
        { role: "user", content: "Transforme les pions en mines" },
      ],
    });

    expect(supabaseInvokeMock).toHaveBeenCalledTimes(1);
    const call = supabaseInvokeMock.mock.calls[0];
    expect(call?.[1]).toMatchObject({
      body: expect.objectContaining({
        prompt: "Transforme les pions en mines",
      }),
    });
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("returns the remote result when the edge function succeeds", async () => {
    const { invokeRuleGeneratorChat } = await import("./functions");

    supabaseInvokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        result: buildRemoteReadyResult("Ajoute un blink pour les fous"),
      },
      error: null,
    });

    const result = await invokeRuleGeneratorChat({
      conversation: [
        { role: "user", content: "Ajoute un blink pour les fous" },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.provider).toBe("groq+heuristic");
      expect(result.rule).toHaveProperty("meta.ruleId", "remote");
      expect(result.prompt).toBe("Ajoute un blink pour les fous");
    }
  });

  it("falls back to the heuristic pipeline when the edge function fails", async () => {
    supabaseInvokeMock.mockRejectedValueOnce(new Error("network"));

    const { invokeRuleGeneratorChat } = await import("./functions");

    const result = await invokeRuleGeneratorChat({
      conversation: [
        { role: "user", content: "Ajoute un blink pour les fous" },
      ],
    });

    expect(pipelineMock).toHaveBeenCalledWith("Ajoute un blink pour les fous", {
      forceFallback: true,
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.provider).toMatch(/local-pipeline/);
      expect(result.rule).toHaveProperty("meta.ruleId", "fallback");
    }
  });

  it("propagates pipeline failures with a descriptive error", async () => {
    supabaseInvokeMock.mockRejectedValueOnce(new Error("network"));
    pipelineMock.mockImplementation(() => {
      throw new Error("Pipeline crash");
    });

    const { invokeRuleGeneratorChat } = await import("./functions");

    await expect(
      invokeRuleGeneratorChat({
        conversation: [{ role: "user", content: "Décris une règle" }],
      }),
    ).rejects.toThrow(/l'appel distant a échoué/);
  });
});
