import { describe, expect, it, beforeEach, vi } from "vitest";
import { RULE_GENERATOR_MIN_PROMPT_LENGTH } from "../../../shared/rule-generator.ts";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
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
});
