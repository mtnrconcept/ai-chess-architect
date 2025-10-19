import { z } from "zod";
import { GroqDriver } from "./providers/groq";
import { LovableDriver } from "./providers/lovable";
import { GeminiDriver } from "./providers/gemini";

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
    const orderedNames = options.order ?? ["lovable", "groq", "gemini"];
    this.drivers = orderedNames
      .map((name) => availableDrivers.get(name))
      .filter((driver): driver is LLMDriver => Boolean(driver))
      .filter((driver) => driver.isEnabled());

    if (this.drivers.length === 0) {
      throw new Error(
        "No LLM drivers are enabled. Configure at least one provider key.",
      );
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

    const reasons = errors.map((err) => err.message).join("; ");
    throw new Error(`All LLM providers failed: ${reasons}`);
  }

  private createDrivers(
    overrides?: Partial<Record<string, LLMDriver>>,
  ): Map<string, LLMDriver> {
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

export { LovableDriver } from "./providers/lovable";
export { GroqDriver } from "./providers/groq";
export { GeminiDriver } from "./providers/gemini";

export const CoachSchema = z.object({
  headline: z.string(),
  why_bad_or_good: z.string(),
  what_to_learn: z.array(z.string()).min(1).max(3),
  best_line_explained: z.string(),
});

export type CoachOutput = z.infer<typeof CoachSchema>;

export interface ExplainInput {
  readonly fen_before: string;
  readonly move_san: string;
  readonly move_uci: string;
  readonly best_uci?: string;
  readonly delta_ep: number;
  readonly pv_top1?: string[];
  readonly phase: "opening" | "middlegame" | "endgame";
  readonly themes?: string[];
  readonly elo_bucket?: "novice" | "club" | "master";
}

export interface ExplainMoveOptions {
  readonly provider?: LLMProvider;
  readonly providerOptions?: LLMProviderOptions;
  readonly llmRequest?: Partial<Pick<LLMRequest, "maxTokens" | "temperature">>;
}

export async function explainMove(
  input: ExplainInput,
  options: ExplainMoveOptions = {},
): Promise<CoachOutput> {
  const provider = options.provider ?? new LLMProvider(options.providerOptions);
  const prompt = buildPrompt(input);

  try {
    const response = await provider.complete({
      prompt,
      maxTokens: options.llmRequest?.maxTokens ?? 512,
      temperature: options.llmRequest?.temperature ?? 0.2,
    });

    const parsed = JSON.parse(response.output);
    return CoachSchema.parse(parsed);
  } catch {
    return {
      headline: "Analyse indisponible",
      why_bad_or_good:
        "Le coach n'a pas réussi à générer une explication détaillée pour ce coup.",
      what_to_learn: [
        "Rejouer la position et identifier les tactiques manquées",
      ],
      best_line_explained: input.best_uci
        ? `La suggestion principale restait ${input.best_uci}.`
        : "Concentre-toi sur les coups qui conservent ton avantage.",
    } satisfies CoachOutput;
  }
}

function buildPrompt(input: ExplainInput): string {
  return JSON.stringify({
    role: "system",
    instruction:
      "Rédige une explication brève et pédagogique pour un joueur d'échecs. Réponds STRICTEMENT en JSON conforme au schema.",
    schema: {
      headline: "string",
      why_bad_or_good: "string",
      what_to_learn: ["string", "string", "string"],
      best_line_explained: "string",
    },
    input,
    style: { concise: true, vocabulary: "débutant+" },
  });
}
