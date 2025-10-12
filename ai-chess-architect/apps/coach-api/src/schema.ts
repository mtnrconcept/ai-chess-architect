import { z } from 'zod';

export const IngestBody = z.object({
  pgn: z.string().optional(),
  moves: z
    .array(
      z.object({
        san: z.string(),
        uci: z.string().optional(),
        fen_before: z.string(),
        fen_after: z.string(),
        time_ms: z.number().int().optional()
      })
    )
    .optional(),
  source: z.string().optional(),
  owner_id: z.string()
});
