export async function providerGroq(prompt: string): Promise<string> {
  return JSON.stringify({
    headline: 'Bon coup, pas le meilleur',
    why_bad_or_good: 'Tu conserves un petit avantage mais la ligne optimale gagnait plus d’espace au centre.',
    what_to_learn: ['Prioriser le contrôle du centre'],
    best_line_explained: 'La ligne recommandée améliore la coordination et crée une menace directe.'
  });
}
