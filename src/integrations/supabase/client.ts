import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const PLACEHOLDER_SUPABASE_URL = /example\.com/i;

const normaliseEnvValue = (value: string | undefined | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type ImportMetaEnvRecord = Record<string, string | boolean | undefined>;
type GlobalProcessEnv = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

const importMetaEnv = import.meta.env as ImportMetaEnvRecord;
const globalProcessEnv =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as GlobalProcessEnv).process?.env === "object"
    ? ((globalThis as GlobalProcessEnv).process!.env as Record<
        string,
        string | undefined
      >)
    : undefined;

const readEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const fromImportMeta = importMetaEnv[key];
    if (typeof fromImportMeta === "string") {
      const normalised = normaliseEnvValue(fromImportMeta);
      if (normalised) return normalised;
    }

    const fromGlobal = globalProcessEnv?.[key];
    if (typeof fromGlobal === "string") {
      const normalised = normaliseEnvValue(fromGlobal);
      if (normalised) return normalised;
    }
  }

  return undefined;
};

const EXPECTED_PROJECT_ID = "ucaqbhmyutlnitnedowk";
const EXPECTED_PROJECT_NAME = "AI Chess Architect";

const RAW_SUPABASE_PROJECT_ID = readEnvValue(
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_REF",
  "VITE_SUPABASE_REFERENCE_ID",
  "VITE_SUPABASE_PROJECT",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_REFERENCE_ID",
  "SUPABASE_PROJECT",
);

const RAW_SUPABASE_URL = readEnvValue("VITE_SUPABASE_URL", "SUPABASE_URL");
const NORMALISED_PROJECT_ID = normaliseEnvValue(RAW_SUPABASE_PROJECT_ID);
const EFFECTIVE_PROJECT_ID = NORMALISED_PROJECT_ID ?? EXPECTED_PROJECT_ID;
const RAW_PROJECT_NAME = readEnvValue(
  "VITE_SUPABASE_PROJECT_NAME",
  "SUPABASE_PROJECT_NAME",
);
const NORMALISED_PROJECT_NAME = normaliseEnvValue(RAW_PROJECT_NAME);
const EFFECTIVE_PROJECT_NAME = NORMALISED_PROJECT_NAME ?? EXPECTED_PROJECT_NAME;
const IS_PLACEHOLDER_URL = RAW_SUPABASE_URL
  ? PLACEHOLDER_SUPABASE_URL.test(RAW_SUPABASE_URL)
  : false;

const RAW_FUNCTIONS_URL = readEnvValue(
  "VITE_SUPABASE_FUNCTIONS_URL",
  "SUPABASE_FUNCTIONS_URL",
);

const normaliseFunctionsOrigin = (value: string | undefined) => {
  const normalised = normaliseEnvValue(value);
  if (!normalised) return undefined;

  try {
    const candidate =
      normalised.startsWith("http://") || normalised.startsWith("https://")
        ? normalised
        : `https://${normalised}`;
    const url = new URL(candidate);
    return `${url.protocol}//${url.host}`;
  } catch (_error) {
    return undefined;
  }
};

const deriveFunctionsOriginFromSupabaseUrl = (value: string | undefined) => {
  if (!value) return undefined;

  try {
    const candidate =
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`;
    const url = new URL(candidate);
    if (!url.host.endsWith(".supabase.co")) {
      return `${url.protocol}//${url.host}`;
    }

    const functionsHost = `${url.host.replace(".supabase.co", ".functions.supabase.co")}`;
    return `${url.protocol}//${functionsHost}`;
  } catch (_error) {
    return undefined;
  }
};

const SUPABASE_URL =
  !RAW_SUPABASE_URL || IS_PLACEHOLDER_URL
    ? EFFECTIVE_PROJECT_ID
      ? `https://${EFFECTIVE_PROJECT_ID}.supabase.co`
      : undefined
    : RAW_SUPABASE_URL;

const SUPABASE_FUNCTIONS_URL =
  normaliseFunctionsOrigin(RAW_FUNCTIONS_URL) ??
  deriveFunctionsOriginFromSupabaseUrl(SUPABASE_URL) ??
  (EFFECTIVE_PROJECT_ID
    ? `https://${EFFECTIVE_PROJECT_ID}.functions.supabase.co`
    : undefined);

const SUPABASE_ANON_KEY = readEnvValue(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "VITE_SUPABASE_PUBLIC_ANON_KEY",
  "VITE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "SUPABASE_PUBLIC_ANON_KEY",
  "ANON_KEY",
);

const JWT_KEY_PATTERN = /^[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+$/;
const SB_PREFIX_KEY_PATTERN = /^sb_[a-z]+_[A-Za-z0-9\-_=.]+$/;

const isValidSupabaseKey = (value: string) =>
  JWT_KEY_PATTERN.test(value) || SB_PREFIX_KEY_PATTERN.test(value);

type SupabaseDiagnostics = {
  initialisedAt: string;
  expectedProjectId: string;
  expectedProjectName: string;
  configuredProjectId?: string | null;
  configuredProjectName?: string | null;
  resolvedProjectId: string;
  resolvedProjectName: string;
  projectId?: string | null;
  rawUrl?: string | null;
  resolvedUrl?: string | null;
  isPlaceholderUrl: boolean;
  anonKeyPreview?: string | null;
  functionsUrl?: string | null;
  problems: string[];
};

declare global {
  interface Window {
    __SUPABASE_ENV_DIAG__?: SupabaseDiagnostics;
  }

  var __SUPABASE_CLIENT__: SupabaseClient<Database> | null | undefined;
}

function buildEnvProblems() {
  const problems: string[] = [];

  if (!SUPABASE_ANON_KEY) {
    problems.push(
      "Clé Supabase (anon/publishable) manquante (VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY).",
    );
  } else if (!isValidSupabaseKey(SUPABASE_ANON_KEY)) {
    problems.push(
      "Clé Supabase invalide (attendu un jeton JWT ou une clé sb_ publishable/service)",
    );
  }

  if (!SUPABASE_URL) {
    if (IS_PLACEHOLDER_URL && !NORMALISED_PROJECT_ID) {
      problems.push("L'URL Supabase pointe vers example.com (placeholder)");
    }

    if (!NORMALISED_PROJECT_ID) {
      problems.push(
        "URL Supabase manquante (VITE_SUPABASE_URL ou SUPABASE_URL) et identifiant de projet absent",
      );
    } else {
      problems.push(
        "Impossible de construire l'URL Supabase (valeur invalide pour VITE_SUPABASE_URL/SUPABASE_URL)",
      );
    }
  }

  if (NORMALISED_PROJECT_ID && NORMALISED_PROJECT_ID !== EXPECTED_PROJECT_ID) {
    problems.push(
      `Identifiant de projet Supabase inattendu: ${NORMALISED_PROJECT_ID} (attendu ${EXPECTED_PROJECT_ID} pour ${EXPECTED_PROJECT_NAME}).`,
    );
  }

  if (
    NORMALISED_PROJECT_NAME &&
    NORMALISED_PROJECT_NAME !== EXPECTED_PROJECT_NAME
  ) {
    problems.push(
      `Nom de projet Supabase inattendu: ${NORMALISED_PROJECT_NAME} (attendu ${EXPECTED_PROJECT_NAME}).`,
    );
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
    __CHESS_ARCHITECT_SUPABASE_LOGGED__?: boolean;
  };

  if (
    globalScope.__SUPABASE_CLIENT__ !== undefined &&
    globalScope.__SUPABASE_ENV_DIAG__
  ) {
    return {
      client: globalScope.__SUPABASE_CLIENT__,
      diagnostics: globalScope.__SUPABASE_ENV_DIAG__,
    } satisfies SupabaseInitialisation;
  }

  const problems = buildEnvProblems();

  if (!globalScope.__CHESS_ARCHITECT_SUPABASE_LOGGED__) {
    const messages: string[] = [];

    if (!NORMALISED_PROJECT_ID) {
      messages.push(
        `Aucun identifiant de projet explicite détecté. Utilisation du projet ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_ID}).`,
      );
    }

    if (
      NORMALISED_PROJECT_ID &&
      NORMALISED_PROJECT_ID !== EXPECTED_PROJECT_ID
    ) {
      messages.push(
        `Identifiant de projet Supabase inattendu: ${NORMALISED_PROJECT_ID}. Attendu ${EXPECTED_PROJECT_ID} pour ${EXPECTED_PROJECT_NAME}.`,
      );
    }

    if (
      NORMALISED_PROJECT_NAME &&
      NORMALISED_PROJECT_NAME !== EXPECTED_PROJECT_NAME
    ) {
      messages.push(
        `Nom de projet Supabase inattendu: ${NORMALISED_PROJECT_NAME}. Utilisation de ${EXPECTED_PROJECT_NAME}.`,
      );
    }

    if (messages.length > 0) {
      console.warn(`[AI Chess Architect] ${messages.join(" ")}`);
    } else {
      console.log(
        `[AI Chess Architect] Client configuré pour ${EXPECTED_PROJECT_NAME} (${EFFECTIVE_PROJECT_ID}).`,
      );
    }

    globalScope.__CHESS_ARCHITECT_SUPABASE_LOGGED__ = true;
  }

  const diagnostics: SupabaseDiagnostics = {
    initialisedAt: new Date().toISOString(),
    expectedProjectId: EXPECTED_PROJECT_ID,
    expectedProjectName: EXPECTED_PROJECT_NAME,
    configuredProjectId: NORMALISED_PROJECT_ID ?? null,
    configuredProjectName: NORMALISED_PROJECT_NAME ?? null,
    resolvedProjectId: EFFECTIVE_PROJECT_ID,
    resolvedProjectName: EFFECTIVE_PROJECT_NAME,
    projectId: EFFECTIVE_PROJECT_ID,
    rawUrl: RAW_SUPABASE_URL ?? null,
    resolvedUrl: SUPABASE_URL ?? null,
    isPlaceholderUrl: IS_PLACEHOLDER_URL,
    anonKeyPreview: SUPABASE_ANON_KEY
      ? `${SUPABASE_ANON_KEY.slice(0, 6)}…${SUPABASE_ANON_KEY.slice(-4)}`
      : null,
    functionsUrl: SUPABASE_FUNCTIONS_URL ?? null,
    problems,
  };

  if (typeof window !== "undefined") {
    window.__SUPABASE_ENV_DIAG__ = diagnostics;
  }

  globalScope.__SUPABASE_ENV_DIAG__ = diagnostics;

  if (problems.length > 0) {
    console.error(
      `Supabase env invalides: ${problems.join(" | ")}. Corrige tes variables Lovable (Preview/Prod) avant de déployer.`,
    );
    globalScope.__SUPABASE_CLIENT__ = null;

    return { client: null, diagnostics } satisfies SupabaseInitialisation;
  }

  const isWebSocketPrototypeFrozen =
    typeof globalThis.WebSocket === "function" &&
    (Object.isFrozen?.(globalThis.WebSocket.prototype) ?? false);

  if (isWebSocketPrototypeFrozen) {
    console.warn(
      "[AI Chess Architect] WebSocket prototype is frozen — skipping realtime patches that rely on prototype mutation.",
    );
  }

  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    ...(SUPABASE_FUNCTIONS_URL
      ? {
          functions: {
            url: SUPABASE_FUNCTIONS_URL,
          },
        }
      : {}),
  });

  globalScope.__SUPABASE_CLIENT__ = client;

  return { client, diagnostics } satisfies SupabaseInitialisation;
}

const { client: supabase, diagnostics: supabaseDiagnostics } =
  createSingletonClient();

export { supabase, supabaseDiagnostics };
export type { SupabaseDiagnostics };

export const isSupabaseConfigured = supabase !== null;
export const supabaseEnvProblems = supabaseDiagnostics.problems;
export const supabaseAnonKey = SUPABASE_ANON_KEY ?? null;
export const supabaseFunctionsUrl = SUPABASE_FUNCTIONS_URL ?? null;

export const resolveSupabaseFunctionUrl = (path: string): string | null => {
  if (!SUPABASE_FUNCTIONS_URL) {
    return null;
  }

  const trimmedBase = SUPABASE_FUNCTIONS_URL.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");

  if (!trimmedPath) {
    return trimmedBase;
  }

  return `${trimmedBase}/${trimmedPath}`;
};

export function requireSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      `Le client Supabase n'est pas initialisé. Vérifie ta configuration: ${supabaseEnvProblems.join(" | ")}`,
    );
  }

  return supabase;
}
