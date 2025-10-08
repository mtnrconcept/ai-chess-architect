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

  if (rawMessage.includes(EDGE_FUNCTION_ERROR_SIGNATURE)) {
    return "Impossible de contacter la fonction Edge. Vérifiez votre connexion internet ou la configuration Supabase.";
  }

  if (rawMessage.includes('LOVABLE_API_KEY is not configured')) {
    return "La clé API Lovable n'est pas configurée côté serveur. Ajoutez-la dans les variables d'environnement Supabase.";
  }

  if (NETWORK_ERROR_PATTERNS.some(pattern => rawMessage.includes(pattern))) {
    return "Erreur réseau lors de l'appel de la fonction Edge. Réessayez dans quelques instants.";
  }

  return rawMessage;
};
