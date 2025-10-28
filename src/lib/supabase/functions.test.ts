import { describe, expect, it, beforeEach, vi } from "vitest";
import { RULE_GENERATOR_MIN_PROMPT_LENGTH } from "../../../shared/rule-generator.ts";

const invokeMock = vi.fn();
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: null } });
const resolveSupabaseFunctionUrlMock =
  vi.fn<(path: string) => string | null | undefined>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
    auth: {
      getSession: getSessionMock,
    },
  },
  resolveSupabaseFunctionUrl: resolveSupabaseFunctionUrlMock,
  supabaseAnonKey: "anon-test-key",
  supabaseDiagnostics: {
    functionsUrl: null,
    resolvedProjectId: null,
  },
  supabaseFunctionsUrl: null,
}));

const buildNeedInfoResponse = () => ({
  ok: true as const,
  result: {
    status: "need_info" as const,
    questions: [],
    prompt: "server-prompt",
    promptHash: "hash",
    correlationId: "correlation",
    rawModelResponse: {},
    provider: "test",
  },
});

const buildReadyResponse = () => ({
  ok: true as const,
  result: {
    status: "ready" as const,
    rule: { id: "rule-id" },
    prompt: "server-prompt",
    promptHash: "hash",
    correlationId: "correlation",
    rawModelResponse: { text: "raw" },
    provider: "test",
  },
});

describe("invokeRuleGeneratorChat", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resolveSupabaseFunctionUrlMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: null } });
  });

  it("omits the prompt when it is shorter than the minimum length", async () => {
    invokeMock.mockResolvedValue({
      data: buildNeedInfoResponse(),
      error: null,
    });

    const { invokeRuleGeneratorChat } = await import("./functions");

    const result = await invokeRuleGeneratorChat({
      prompt: "short",
      conversation: [
        {
          role: "user",
          content: "Hello there",
        },
      ],
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const invokeArgs = invokeMock.mock.calls[0]?.[1];
    const body = (invokeArgs as { body?: Record<string, unknown> } | undefined)
      ?.body;

    expect(body).toBeTruthy();
    expect(body).not.toHaveProperty("prompt");
    expect(result.status).toBe("need_info");
  });

  it("includes the prompt when it meets the minimum length", async () => {
    invokeMock.mockResolvedValue({
      data: buildNeedInfoResponse(),
      error: null,
    });

    const { invokeRuleGeneratorChat } = await import("./functions");

    const validPrompt = "x".repeat(RULE_GENERATOR_MIN_PROMPT_LENGTH);

    await invokeRuleGeneratorChat({
      prompt: validPrompt,
      conversation: [
        {
          role: "user",
          content: "Hello there",
        },
      ],
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const invokeArgs = invokeMock.mock.calls[0]?.[1];
    const body = (invokeArgs as { body?: Record<string, unknown> } | undefined)
      ?.body;

    expect(body).toBeTruthy();
    expect(body).toHaveProperty("prompt", validPrompt);
  });

  it("propagates ready responses with the new result shape", async () => {
    invokeMock.mockResolvedValue({
      data: buildReadyResponse(),
      error: null,
    });

    const { invokeRuleGeneratorChat } = await import("./functions");

    const result = await invokeRuleGeneratorChat({
      prompt: "x".repeat(RULE_GENERATOR_MIN_PROMPT_LENGTH),
      conversation: [
        {
          role: "user",
          content: "Hello there",
        },
      ],
    });

    expect(result.status).toBe("ready");
    expect(result.rule).toEqual({ id: "rule-id" });
  });

  it("sends the full conversation transcript to the backend", async () => {
    invokeMock.mockResolvedValue({
      data: buildNeedInfoResponse(),
      error: null,
    });

    const { invokeRuleGeneratorChat } = await import("./functions");

    const conversation = [
      { role: "user", content: "Bonjour" },
      { role: "assistant", content: "Salut" },
      { role: "user", content: "Propose une variante" },
    ];

    await invokeRuleGeneratorChat({
      prompt: "x".repeat(RULE_GENERATOR_MIN_PROMPT_LENGTH),
      conversation,
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const invokeArgs = invokeMock.mock.calls[0]?.[1];
    const body = (invokeArgs as { body?: Record<string, unknown> } | undefined)
      ?.body as { conversation?: unknown } | undefined;

    expect(body?.conversation).toEqual(conversation);
  });

  it("falls back to direct fetch responses using the wrapped payload", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error("CORS error: missing x-client-info header"),
    });

    resolveSupabaseFunctionUrlMock.mockReturnValueOnce(
      "https://edge.example.com/generate-chess-rule",
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            result: {
              status: "ready",
              rule: { id: "rule-id" },
              prompt: "server-prompt",
              promptHash: "hash-value",
              provider: "edge-test",
              rawModelResponse: { model: "mock", text: "{}" },
              correlationId: "edge-correlation",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const { invokeRuleGeneratorChat } = await import("./functions");

      const result = await invokeRuleGeneratorChat({
        prompt: "x".repeat(RULE_GENERATOR_MIN_PROMPT_LENGTH),
        conversation: [{ role: "user", content: "Bonjour" }],
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ready");
      expect(result.rule).toEqual({ id: "rule-id" });
      expect(result.provider).toBe("edge-test");
      expect(result.prompt).toBe("server-prompt");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
