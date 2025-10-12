import type { LLMRequest, LLMResponse } from '../index';
import { HttpLLMDriver } from './base';

export class GeminiDriver extends HttpLLMDriver {
  public constructor() {
    super({
      name: 'gemini',
      apiKeyEnv: 'GEMINI_API_KEY',
      modelEnv: 'GEMINI_MODEL',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      defaultModel: 'gemini-pro',
    });
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.getApiKey();
    const model = this.getModelOverride();
    const url = `${this.baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [
        {
          parts: [{ text: request.prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.2,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const payload: any = await response.json();
    const output = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? '').join('\n') ?? '';

    return {
      model,
      output,
      usage: {
        promptTokens: payload?.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: payload?.usageMetadata?.candidatesTokenCount ?? 0,
      },
      latencyMs: 0,
    };
  }
}
