import { createClient } from '@supabase/supabase-js';

import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url) {
  throw new Error('[Supabase] Missing VITE_SUPABASE_URL environment variable.');
}

if (!anonKey) {
  throw new Error('[Supabase] Missing VITE_SUPABASE_ANON_KEY environment variable.');
}

console.info('[Supabase] Supabase URL present');

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
