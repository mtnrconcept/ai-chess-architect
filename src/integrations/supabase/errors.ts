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

  // Lovable AI rate limit (429)
  if (rawMessage.includes('429') || rawMessage.includes('Rate limit') || rawMessage.includes('Too Many Requests')) {
    return "Limite de requêtes Lovable AI atteinte. Veuillez patienter quelques instants avant de réessayer.";
  }

  // Lovable AI credits exhausted (402)
  if (rawMessage.includes('402') || rawMessage.includes('Payment Required') || rawMessage.includes('credits')) {
    return "Crédits Lovable AI épuisés. Veuillez recharger vos crédits pour continuer à utiliser l'IA.";
  }

  if (rawMessage.includes(EDGE_FUNCTION_ERROR_SIGNATURE)) {
    return "Impossible de contacter la fonction. Vérifiez votre connexion internet.";
  }

  if (rawMessage.includes('LOVABLE_API_KEY is not configured')) {
    return "La clé API Lovable n'est pas configurée. Contactez le support.";
  }

  if (NETWORK_ERROR_PATTERNS.some(pattern => rawMessage.includes(pattern))) {
    return "Erreur réseau. Réessayez dans quelques instants.";
  }

  return rawMessage;
};
