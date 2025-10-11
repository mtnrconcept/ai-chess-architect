import { createClient } from '@supabase/supabase-js';

import type { Database } from './types';

const FALLBACK_SUPABASE_URL = 'https://example.com';
const FALLBACK_SUPABASE_ANON_KEY = 'supabase-anon-key-placeholder';

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(rawUrl && rawAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY sont manquants. Utilisation d\'un client fictif pour la prévisualisation.'
  );
  console.warn(
    "[Supabase] Ajoutez ces variables d'environnement pour activer les fonctionnalités connectées à Supabase."
  );
}

const supabaseFetchFallback: typeof fetch = async (input) => {
  console.warn(`[Supabase] Requête ignorée car Supabase n'est pas configuré : ${input.toString()}`);

  return new Response(
    JSON.stringify({
      message:
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable data features.',
      error: 'supabase-not-configured',
      hint: 'Add the missing variables to your environment before building the app.',
      code: 'CONFIG_NOT_SET',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};

export const supabase = createClient<Database>(
  rawUrl || FALLBACK_SUPABASE_URL,
  rawAnonKey || FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    ...(isSupabaseConfigured
      ? {}
      : {
          global: {
            fetch: supabaseFetchFallback,
          },
        }),
  }
);

console.info(
  `[Supabase] Client initialisé (${isSupabaseConfigured ? 'configuration détectée' : 'mode fictif'})`
);
