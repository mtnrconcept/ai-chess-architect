/**
 * Génération d'identifiants uniques et déduplication par hash de prompt
 */

/**
 * Génère un UUID v4 (fallback temporaire en attendant UUID v7)
 */
export function generateRuleId(): string {
  return crypto.randomUUID();
}

/**
 * Génère un hash SHA-256 du prompt pour déduplication
 * Utilise les 16 premiers caractères du hash
 */
export async function promptHash(prompt: string): Promise<string> {
  const normalized = prompt.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16); // 16 premiers caractères
}

/**
 * Génère un correlation ID pour tracer une exécution complète
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
