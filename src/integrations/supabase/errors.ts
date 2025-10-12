const EDGE_FUNCTION_ERROR_SIGNATURE = 'Failed to send a request to the Edge Function';

const NETWORK_ERROR_PATTERNS = [
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'TypeError: fetch',
  'Network request failed'
];

/**
 * Normalise les messages d'erreur provenant des Edge Functions Supabase afin
 * d'afficher un retour plus exploitable côté interface utilisateur.
 */
export const getSupabaseFunctionErrorMessage = (
  error: unknown,
  fallbackMessage: string
): string => {
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error && error.message
        ? error.message
        : '';

  if (!rawMessage) {
    return fallbackMessage;
  }

  // Rate limit (429)
  if (rawMessage.includes('429') || rawMessage.includes('Rate limit') || rawMessage.includes('Too Many Requests')) {
    return "Limite de requêtes du fournisseur IA atteinte. Veuillez patienter quelques instants avant de réessayer.";
  }

  // Credits exhausted (402)
  if (rawMessage.includes('402') || rawMessage.includes('Payment Required') || rawMessage.includes('credits')) {
    return "Crédits du fournisseur IA épuisés. Veuillez recharger ou changer de fournisseur pour continuer.";
  }

  if (rawMessage.includes(EDGE_FUNCTION_ERROR_SIGNATURE)) {
    return "Impossible de contacter la fonction. Vérifiez votre connexion internet.";
  }

  if (rawMessage.includes("Aucun fournisseur IA n'est configuré")) {
    return "Aucun fournisseur IA n'est configuré. Ajoutez une clé API Groq, Lovable, OpenAI ou Gemini dans Supabase.";
  }

  if (NETWORK_ERROR_PATTERNS.some(pattern => rawMessage.includes(pattern))) {
    return "Erreur réseau. Réessayez dans quelques instants.";
  }

  return rawMessage;
};
