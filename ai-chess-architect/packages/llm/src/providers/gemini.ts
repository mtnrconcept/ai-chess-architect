export async function providerGemini(prompt: string): Promise<string> {
  // TODO: call Gemini GenerateContent (json mode); stub mock:
  return JSON.stringify({
    headline: 'Tu laisses une pièce en prise',
    why_bad_or_good: "Après ton coup, ton fou n'est plus défendu et l'adversaire peut le capturer sans compensation.",
    what_to_learn: ['Vérifier les pièces non protégées', 'Chercher le coup actif le plus simple'],
    best_line_explained: 'Le meilleur coup maintient la pression en développant une pièce et protège le fou.'
  });
}
