const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const rawPublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const rawProjectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "").trim();

if (!rawUrl) {
  throw new Error(
    "[Supabase] VITE_SUPABASE_URL est manquant. Assurez-vous que l'URL du projet est définie dans votre fichier d'environnement."
  );
}

let normalizedUrl: string;
try {
  const parsed = new URL(rawUrl);
  normalizedUrl = `${parsed.protocol}//${parsed.host}`.replace(/\/$/, "");
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(`URL Supabase invalide dans VITE_SUPABASE_URL : ${reason}`);
}

const projectIdFromUrlMatch = normalizedUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/i);
const projectIdFromUrl = projectIdFromUrlMatch ? projectIdFromUrlMatch[1] : null;

if (!projectIdFromUrl) {
  console.warn(
    "[Supabase] Impossible de déduire l'identifiant du projet depuis l'URL. Vérifiez que l'URL suit le format https://<id>.supabase.co."
  );
}

if (!rawPublishableKey) {
  throw new Error(
    "[Supabase] VITE_SUPABASE_PUBLISHABLE_KEY est manquant. Ajoutez votre clé publique Supabase dans le fichier d'environnement."
  );
}

if (rawProjectId && projectIdFromUrl && rawProjectId !== projectIdFromUrl) {
  console.warn(
    `[Supabase] L'identifiant configuré ("${rawProjectId}") ne correspond pas à celui déduit de l'URL ("${projectIdFromUrl}").`
  );
}

if (!rawProjectId && projectIdFromUrl) {
  console.warn(
    `[Supabase] VITE_SUPABASE_PROJECT_ID n'est pas défini. Utilisation implicite de l'identifiant "${projectIdFromUrl}" issu de l'URL.`
  );
}

export const SUPABASE_URL = normalizedUrl;
export const SUPABASE_PUBLISHABLE_KEY = rawPublishableKey;
export const SUPABASE_PROJECT_ID = rawProjectId || projectIdFromUrl || "";
