import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function invariantEnv() {
  const problems: string[] = [];

  if (!SUPABASE_URL) {
    problems.push('VITE_SUPABASE_URL manquante');
  }

  if (!SUPABASE_ANON_KEY) {
    problems.push('VITE_SUPABASE_ANON_KEY manquante');
  }

  if (SUPABASE_URL && /example\.com/i.test(SUPABASE_URL)) {
    problems.push('VITE_SUPABASE_URL pointe vers example.com (placeholder)');
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
