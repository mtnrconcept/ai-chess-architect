export type Phase = 'opening' | 'middlegame' | 'endgame';
export type Quality =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'great'
  | 'brilliant'
  | 'book'
  | 'forced'
  | 'miss';

export function winProbFromScore(score: { cp?: number; mate?: number }, phase: Phase): number {
  if (score.mate !== undefined) {
    // mate in N : map rapide (positif => quasi 1, négatif => quasi 0)
    const sign = Math.sign(score.mate);
    const dist = Math.min(Math.abs(score.mate), 8);
    return sign > 0 ? 0.9 + 0.01 * (8 - dist) : 0.1 - 0.01 * (8 - dist);
  }
  const cp = score.cp ?? 0;
  const scale = phase === 'endgame' ? 150 : 200; // petits avantages pèsent plus en finale
  return 1 / (1 + Math.exp(-cp / scale)); // logistique
}

export function classify(
  deltaEP: number,
  context: {
    phase: Phase;
    isBook?: boolean;
    sacrifice?: boolean;
    uniqueSave?: boolean;
    alreadyWinning?: boolean;
    elo?: number;
  }
): Quality {
  if (context.isBook) return 'book';
  // Great / Brilliant logiques qualitatives
  if (context.uniqueSave && deltaEP > 0.0) return 'great';
  if (context.sacrifice && deltaEP >= -0.01 && !context.alreadyWinning) return 'brilliant';

  // Seuils EP inspirés chess.com (adaptés novices)
  const noviceTol = context.elo && context.elo < 1200 ? 0.01 : 0;
  if (deltaEP >= -0.005 - noviceTol) return 'best';
  if (deltaEP >= -0.02 - noviceTol) return 'excellent';
  if (deltaEP >= -0.05 - noviceTol) return 'good';
  if (deltaEP >= -0.1) return 'inaccuracy';
  if (deltaEP >= -0.2) return 'mistake';
  return 'blunder';
}

export function accuracyFromDeltas(deltas: number[]): number {
  // 100 - pénalités normalisées
  // pénalité = sum(max(0, -deltaEP))*100, bornée
  const penalty = deltas.reduce((a, d) => a + Math.max(0, -d), 0);
  return Math.max(0, 100 - Math.min(100, penalty * 100));
}
