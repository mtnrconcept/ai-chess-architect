import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_URL =
  !RAW_SUPABASE_URL || /example\.com/i.test(RAW_SUPABASE_URL)
    ? SUPABASE_PROJECT_ID
      ? `https://${SUPABASE_PROJECT_ID}.supabase.co`
      : undefined
    : RAW_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function invariantEnv() {
  const problems: string[] = [];

  if (!SUPABASE_ANON_KEY) {
    problems.push('VITE_SUPABASE_ANON_KEY manquante');
  }

  if (!SUPABASE_URL) {
    if (!SUPABASE_PROJECT_ID) {
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
