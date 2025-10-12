import type { LLMDriver, LLMRequest, LLMResponse } from '../index';

interface HttpDriverConfig {
  readonly apiKeyEnv: string;
  readonly modelEnv?: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly name: string;
}

export abstract class HttpLLMDriver implements LLMDriver {
  public readonly name: string;
  protected readonly baseUrl: string;
  protected readonly apiKeyEnv: string;
  protected readonly defaultModel: string;
  protected readonly modelEnv?: string;

  protected constructor(config: HttpDriverConfig) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKeyEnv = config.apiKeyEnv;
    this.defaultModel = config.defaultModel;
    this.modelEnv = config.modelEnv;
  }

  public isEnabled(): boolean {
    return Boolean(process.env[this.apiKeyEnv]);
  }

  public abstract complete(request: LLMRequest): Promise<LLMResponse>;

  protected getModelOverride(): string {
    return process.env[this.modelEnv ?? ''] ?? this.defaultModel;
  }

  protected getHeaders(apiKey: string): HeadersInit {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
  }

  protected parseUsage(response: { prompt_tokens?: number; completion_tokens?: number }): {
    promptTokens: number;
    completionTokens: number;
  } {
    return {
      promptTokens: response.prompt_tokens ?? 0,
      completionTokens: response.completion_tokens ?? 0,
    };
  }

  protected getApiKey(): string {
    const key = process.env[this.apiKeyEnv];
    if (!key) {
      throw new Error(`${this.name}: missing API key in environment variable ${this.apiKeyEnv}`);
    }
    return key;
  }
}
