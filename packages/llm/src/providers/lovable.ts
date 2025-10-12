import type { LLMRequest, LLMResponse } from '../index';
import { HttpLLMDriver } from './base';

export class LovableDriver extends HttpLLMDriver {
  public constructor() {
    super({
      name: 'lovable',
      apiKeyEnv: 'LOVABLE_API_KEY',
      modelEnv: 'LOVABLE_MODEL',
      baseUrl: 'https://api.lovable.dev/v1/chat/completions',
      defaultModel: 'lovable-chat-32k',
    });
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.getApiKey();
    const body = {
      model: this.getModelOverride(),
      messages: [{ role: 'user', content: request.prompt }],
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.2,
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.getHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Lovable API error: ${response.status} ${response.statusText}`);
    }

    const payload: any = await response.json();
    const choice = payload?.choices?.[0]?.message?.content ?? '';
    const usage = this.parseUsage(payload?.usage ?? {});

    return {
      model: payload?.model ?? body.model,
      output: choice,
      usage,
      latencyMs: 0,
    };
  }
}
