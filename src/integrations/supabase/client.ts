import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PLACEHOLDER_SUPABASE_URL = /example\.com/i;

const normaliseEnvValue = (value: string | undefined) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const SUPABASE_PROJECT_ID =
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_PROJECT_ID) ??
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_PROJECT_REF) ??
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_REFERENCE_ID) ??
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_PROJECT);

const RAW_SUPABASE_URL = normaliseEnvValue(import.meta.env.VITE_SUPABASE_URL);
const NORMALISED_PROJECT_ID = normaliseEnvValue(SUPABASE_PROJECT_ID);
const IS_PLACEHOLDER_URL = RAW_SUPABASE_URL ? PLACEHOLDER_SUPABASE_URL.test(RAW_SUPABASE_URL) : false;

const SUPABASE_URL =
  !RAW_SUPABASE_URL || IS_PLACEHOLDER_URL
    ? NORMALISED_PROJECT_ID
      ? `https://${NORMALISED_PROJECT_ID}.supabase.co`
      : undefined
    : RAW_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY) ??
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
  normaliseEnvValue(import.meta.env.VITE_SUPABASE_PUBLIC_ANON_KEY) ??
  normaliseEnvValue(import.meta.env.VITE_ANON_KEY);

type SupabaseDiagnostics = {
  initialisedAt: string;
  projectId?: string | null;
  rawUrl?: string | null;
  resolvedUrl?: string | null;
  isPlaceholderUrl: boolean;
  anonKeyPreview?: string | null;
  problems: string[];
};

declare global {
  interface Window {
    __SUPABASE_ENV_DIAG__?: SupabaseDiagnostics;
  }

  // eslint-disable-next-line no-var
  var __SUPABASE_CLIENT__: SupabaseClient<Database> | null | undefined;
}

function buildEnvProblems() {
  const problems: string[] = [];

  if (!SUPABASE_ANON_KEY) {
    problems.push('VITE_SUPABASE_ANON_KEY manquante');
  } else if (!/^[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+$/.test(SUPABASE_ANON_KEY)) {
    problems.push("VITE_SUPABASE_ANON_KEY invalide (ne ressemble pas à un token JWT)");
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

  return problems;
}

type SupabaseInitialisation = {
  client: SupabaseClient<Database> | null;
  diagnostics: SupabaseDiagnostics;
};

function createSingletonClient(): SupabaseInitialisation {
  const globalScope = globalThis as typeof globalThis & {
    __SUPABASE_CLIENT__?: SupabaseClient<Database> | null;
    __SUPABASE_ENV_DIAG__?: SupabaseDiagnostics;
  };

  if (globalScope.__SUPABASE_CLIENT__ !== undefined && globalScope.__SUPABASE_ENV_DIAG__) {
    return {
      client: globalScope.__SUPABASE_CLIENT__,
      diagnostics: globalScope.__SUPABASE_ENV_DIAG__,
    } satisfies SupabaseInitialisation;
  }

  const problems = buildEnvProblems();

  const diagnostics: SupabaseDiagnostics = {
    initialisedAt: new Date().toISOString(),
    projectId: NORMALISED_PROJECT_ID ?? null,
    rawUrl: RAW_SUPABASE_URL ?? null,
    resolvedUrl: SUPABASE_URL ?? null,
    isPlaceholderUrl: IS_PLACEHOLDER_URL,
    anonKeyPreview: SUPABASE_ANON_KEY
      ? `${SUPABASE_ANON_KEY.slice(0, 6)}…${SUPABASE_ANON_KEY.slice(-4)}`
      : null,
    problems,
  };

  if (typeof window !== 'undefined') {
    window.__SUPABASE_ENV_DIAG__ = diagnostics;
  }

  globalScope.__SUPABASE_ENV_DIAG__ = diagnostics;

  if (problems.length > 0) {
    console.error(
      `Supabase env invalides: ${problems.join(' | ')}. Corrige tes variables Lovable (Preview/Prod) avant de déployer.`
    );
    globalScope.__SUPABASE_CLIENT__ = null;

    return { client: null, diagnostics } satisfies SupabaseInitialisation;
  }

  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  globalScope.__SUPABASE_CLIENT__ = client;

  return { client, diagnostics } satisfies SupabaseInitialisation;
}

const { client: supabase, diagnostics: supabaseDiagnostics } = createSingletonClient();

export { supabase, supabaseDiagnostics };
export type { SupabaseDiagnostics };

export const isSupabaseConfigured = supabase !== null;
export const supabaseEnvProblems = supabaseDiagnostics.problems;

export function requireSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      `Le client Supabase n'est pas initialisé. Vérifie ta configuration: ${supabaseEnvProblems.join(' | ')}`
    );
  }

  return supabase;
}
