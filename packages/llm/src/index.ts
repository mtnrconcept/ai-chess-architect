import { GroqDriver } from './providers/groq';
import { LovableDriver } from './providers/lovable';
import { GeminiDriver } from './providers/gemini';

export interface LLMRequest {
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface LLMResponse {
  readonly model: string;
  readonly output: string;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  readonly latencyMs: number;
}

export interface LLMDriver {
  readonly name: string;
  isEnabled(): boolean;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMProviderOptions {
  readonly order?: string[];
  readonly drivers?: Partial<Record<string, LLMDriver>>;
}

export class LLMProvider {
  private readonly drivers: LLMDriver[];

  public constructor(options: LLMProviderOptions = {}) {
    const availableDrivers = this.createDrivers(options.drivers);
    const orderedNames = options.order ?? ['lovable', 'groq', 'gemini'];
    this.drivers = orderedNames
      .map((name) => availableDrivers.get(name))
      .filter((driver): driver is LLMDriver => Boolean(driver))
      .filter((driver) => driver.isEnabled());

    if (this.drivers.length === 0) {
      throw new Error('No LLM drivers are enabled. Configure at least one provider key.');
    }
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const errors: Error[] = [];

    for (const driver of this.drivers) {
      const start = Date.now();
      try {
        const response = await driver.complete(request);
        return {
          ...response,
          latencyMs: Date.now() - start,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
      }
    }

    const reasons = errors.map((err) => err.message).join('; ');
    throw new Error(`All LLM providers failed: ${reasons}`);
  }

  private createDrivers(overrides?: Partial<Record<string, LLMDriver>>): Map<string, LLMDriver> {
    const drivers = new Map<string, LLMDriver>();

    const lovable = overrides?.lovable ?? new LovableDriver();
    const groq = overrides?.groq ?? new GroqDriver();
    const gemini = overrides?.gemini ?? new GeminiDriver();

    drivers.set(lovable.name, lovable);
    drivers.set(groq.name, groq);
    drivers.set(gemini.name, gemini);

    return drivers;
  }
}

export { LovableDriver } from './providers/lovable';
export { GroqDriver } from './providers/groq';
export { GeminiDriver } from './providers/gemini';
