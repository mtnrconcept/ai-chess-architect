/**
 * Génération d'identifiants uniques et déduplication par hash de prompt
 */

export function generateRuleId(): string {
  // Générer un UUID v4 simple (compatible navigateur)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function promptHash(prompt: string): Promise<string> {
  const normalized = prompt.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16); // 16 premiers caractères
}

export function isDuplicate(promptKey: string, existingKeys: string[]): boolean {
  return existingKeys.includes(promptKey);
}
