import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PLACEHOLDER_SUPABASE_URL = /example\.com/i;

const normaliseEnvValue = (value: string | undefined | null) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type ImportMetaEnvRecord = Record<string, string | boolean | undefined>;
type GlobalProcessEnv = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

const importMetaEnv = import.meta.env as ImportMetaEnvRecord;
const globalProcessEnv =
  typeof globalThis !== 'undefined' && typeof (globalThis as GlobalProcessEnv).process?.env === 'object'
    ? ((globalThis as GlobalProcessEnv).process!.env as Record<string, string | undefined>)
    : undefined;

const readEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const fromImportMeta = importMetaEnv[key];
    if (typeof fromImportMeta === 'string') {
      const normalised = normaliseEnvValue(fromImportMeta);
      if (normalised) return normalised;
    }

    const fromGlobal = globalProcessEnv?.[key];
    if (typeof fromGlobal === 'string') {
      const normalised = normaliseEnvValue(fromGlobal);
      if (normalised) return normalised;
    }
  }

  return undefined;
};

const SUPABASE_PROJECT_ID = readEnvValue(
  'VITE_SUPABASE_PROJECT_ID',
  'VITE_SUPABASE_PROJECT_REF',
  'VITE_SUPABASE_REFERENCE_ID',
  'VITE_SUPABASE_PROJECT',
  'SUPABASE_PROJECT_ID',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_REFERENCE_ID',
  'SUPABASE_PROJECT'
);

const RAW_SUPABASE_URL = readEnvValue('VITE_SUPABASE_URL', 'SUPABASE_URL');
const NORMALISED_PROJECT_ID = normaliseEnvValue(SUPABASE_PROJECT_ID);
const IS_PLACEHOLDER_URL = RAW_SUPABASE_URL ? PLACEHOLDER_SUPABASE_URL.test(RAW_SUPABASE_URL) : false;

const SUPABASE_URL =
  !RAW_SUPABASE_URL || IS_PLACEHOLDER_URL
    ? NORMALISED_PROJECT_ID
      ? `https://${NORMALISED_PROJECT_ID}.supabase.co`
      : undefined
    : RAW_SUPABASE_URL;

const SUPABASE_ANON_KEY = readEnvValue(
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'VITE_SUPABASE_PUBLIC_ANON_KEY',
  'VITE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'SUPABASE_PUBLIC_ANON_KEY',
  'ANON_KEY'
);

const JWT_KEY_PATTERN = /^[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+$/;
const SB_PREFIX_KEY_PATTERN = /^sb_[a-z]+_[A-Za-z0-9\-_=.]+$/;

const isValidSupabaseKey = (value: string) => JWT_KEY_PATTERN.test(value) || SB_PREFIX_KEY_PATTERN.test(value);

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
    problems.push(
      'Clé Supabase (anon/publishable) manquante (VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY).'
    );
  } else if (!isValidSupabaseKey(SUPABASE_ANON_KEY)) {
    problems.push("Clé Supabase invalide (attendu un jeton JWT ou une clé sb_ publishable/service)");
  }

  if (!SUPABASE_URL) {
    if (IS_PLACEHOLDER_URL && !NORMALISED_PROJECT_ID) {
      problems.push("L'URL Supabase pointe vers example.com (placeholder)");
    }

    if (!NORMALISED_PROJECT_ID) {
      problems.push("URL Supabase manquante (VITE_SUPABASE_URL ou SUPABASE_URL) et identifiant de projet absent");
    } else {
      problems.push("Impossible de construire l'URL Supabase (valeur invalide pour VITE_SUPABASE_URL/SUPABASE_URL)");
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
