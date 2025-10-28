import type { LLMRequest, LLMResponse } from "../index";
import { HttpLLMDriver } from "./base";

export class GroqDriver extends HttpLLMDriver {
  public constructor() {
    super({
      name: "groq",
      apiKeyEnv: "GROQ_API_KEY",
      modelEnv: "GROQ_MODEL",
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
      defaultModel: "llama-3.1-70b-versatile",
    });
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.getApiKey();
    const body = {
      model: this.getModelOverride(),
      messages: [{ role: "user", content: request.prompt }],
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.1,
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.getHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const payload: any = await response.json();
    const choice = payload?.choices?.[0]?.message?.content ?? "";
    const usage = this.parseUsage(payload?.usage ?? {});

    return {
      model: payload?.model ?? body.model,
      output: choice,
      usage,
      latencyMs: 0,
    };
  }
}
