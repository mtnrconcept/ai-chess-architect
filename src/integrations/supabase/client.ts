import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PLACEHOLDER_SUPABASE_URL = /example\.com/i;

const SUPABASE_PROJECT_ID =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ??
  import.meta.env.VITE_SUPABASE_PROJECT_REF ??
  import.meta.env.VITE_SUPABASE_REFERENCE_ID ??
  import.meta.env.VITE_SUPABASE_PROJECT;

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const NORMALISED_PROJECT_ID = SUPABASE_PROJECT_ID?.trim();
const IS_PLACEHOLDER_URL = RAW_SUPABASE_URL ? PLACEHOLDER_SUPABASE_URL.test(RAW_SUPABASE_URL) : false;

const SUPABASE_URL =
  !RAW_SUPABASE_URL || IS_PLACEHOLDER_URL
    ? NORMALISED_PROJECT_ID
      ? `https://${NORMALISED_PROJECT_ID}.supabase.co`
      : undefined
    : RAW_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLIC_ANON_KEY ??
  import.meta.env.VITE_ANON_KEY;

function invariantEnv() {
  const problems: string[] = [];

  if (!SUPABASE_ANON_KEY) {
    problems.push('VITE_SUPABASE_ANON_KEY manquante');
  }

  if (!SUPABASE_URL) {
    if (IS_PLACEHOLDER_URL && !NORMALISED_PROJECT_ID) {
      problems.push('VITE_SUPABASE_URL pointe vers example.com (placeholder)');
    }

    if (!NORMALISED_PROJECT_ID) {
      problems.push('VITE_SUPABASE_URL manquante et VITE_SUPABASE_PROJECT_ID manquante');
    } else {
      problems.push("Impossible de construire l'URL Supabase (VITE_SUPABASE_URL invalide)");
    }
  }

  if (problems.length) {
    throw new Error(
      `Supabase env invalides: ${problems.join(' | ')}. Corrige tes variables Lovable (Preview/Prod) avant de déployer.`
    );
  }
}

invariantEnv();

export const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
