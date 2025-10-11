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

  if (rawMessage.includes('429') || rawMessage.toLowerCase().includes('too many requests')) {
    return "Limite de requêtes atteinte. Veuillez patienter quelques instants avant de réessayer.";
  }

  if (rawMessage.includes('402') || rawMessage.toLowerCase().includes('payment required')) {
    return "Crédits ou quota insuffisants sur l'API distante.";
  }

  if (rawMessage.includes(EDGE_FUNCTION_ERROR_SIGNATURE)) {
    return "Impossible de contacter la fonction. Vérifiez votre connexion internet.";
  }

  if (NETWORK_ERROR_PATTERNS.some(pattern => rawMessage.includes(pattern))) {
    return "Erreur réseau. Réessayez dans quelques instants.";
  }

  return rawMessage;
};
