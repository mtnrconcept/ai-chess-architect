import type { LLMDriver, LLMRequest, LLMResponse } from "../index";

/**
 * Local OpenAI-compatible driver (LM Studio, Ollama, llama.cpp).
 * - No API key required by default.
 * - Endpoint and model can be overridden via env vars.
 */
export class LocalOpenAIDriver implements LLMDriver {
  public readonly name = "local" as const;

  private endpoint(): string {
    const raw =
      process.env.LOCAL_RULE_MODEL_URL ||
      process.env.OPENAI_BASE_URL ||
      "http://192.168.0.33:1234";
    const trimmed = raw.replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
    return `${trimmed}/v1/chat/completions`;
  }

  private model(): string {
    return (
      process.env.LOCAL_RULE_MODEL_NAME ||
      process.env.OPENAI_MODEL ||
      "openai/gpt-oss-20b"
    );
  }

  public isEnabled(): boolean {
    // Always enabled; uses local endpoint.
    return true;
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const url = this.endpoint();
    const model = this.model();
    const body = {
      model,
      messages: [{ role: "user", content: request.prompt }],
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.2,
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const key =
      process.env.LOCAL_RULE_MODEL_API_KEY || process.env.OPENAI_API_KEY;
    if (key) headers.authorization = `Bearer ${key}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Local LLM error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`,
      );
    }
    const payload = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      model: payload.model || model,
      output: payload?.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: payload?.usage?.prompt_tokens ?? 0,
        completionTokens: payload?.usage?.completion_tokens ?? 0,
      },
      latencyMs: 0,
    };
  }
}
