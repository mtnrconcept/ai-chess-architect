import { z } from 'zod';
import { providerGemini } from './providers/gemini.js';
import { providerGroq } from './providers/groq.js';
import { providerLovable } from './providers/lovable.js';

export const CoachSchema = z.object({
  headline: z.string(),
  why_bad_or_good: z.string(),
  what_to_learn: z.array(z.string()).max(3),
  best_line_explained: z.string()
});

type CoachOut = z.infer<typeof CoachSchema>;

export type ExplainInput = {
  fen_before: string;
  move_san: string;
  move_uci: string;
  best_uci?: string;
  delta_ep: number;
  pv_top1?: string[];
  phase: 'opening' | 'middlegame' | 'endgame';
  themes?: string[];
  elo_bucket?: 'novice' | 'club' | 'master';
};

export async function explainMove(input: ExplainInput): Promise<CoachOut> {
  const prompt = buildPrompt(input);
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const call = provider === 'groq' ? providerGroq : provider === 'lovable' ? providerLovable : providerGemini;

  const raw = await call(prompt);
  try {
    const json = JSON.parse(raw);
    return CoachSchema.parse(json);
  } catch {
    // Fallback template
    return {
      headline: 'Coup améliorable',
      why_bad_or_good: 'Tu pouvais obtenir une meilleure évaluation avec la ligne suggérée.',
      what_to_learn: ['Protéger les pièces non défendues'],
      best_line_explained: `Essaie ${input.best_uci ?? 'le meilleur coup proposé'} pour garder l\'initiative.`
    };
  }
}

function buildPrompt(i: ExplainInput): string {
  return JSON.stringify({
    role: 'system',
    instruction:
      "Rédige une explication brève et pédagogique pour un joueur d'échecs. Réponds STRICTEMENT en JSON conforme au schema.",
    schema: {
      headline: 'string',
      why_bad_or_good: 'string',
      what_to_learn: ['string', 'string', 'string'],
      best_line_explained: 'string'
    },
    input: i,
    style: { concise: true, vocabulary: 'débutant+' }
  });
}
