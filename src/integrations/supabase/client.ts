import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type ImportMetaEnvRecord = Record<string, string | boolean | undefined>;

const importMetaEnv = import.meta.env as ImportMetaEnvRecord;

const normaliseEnvValue = (
  value: string | boolean | undefined,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readPublicEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = normaliseEnvValue(importMetaEnv[key]);
    if (value) return value;
  }
  return undefined;
};

const EXPLICIT_SUPABASE_URL = readPublicEnv("VITE_SUPABASE_URL");
const EXPLICIT_SUPABASE_PROJECT_ID = readPublicEnv(
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_REF",
);
const RAW_SUPABASE_CUSTOM_HOST = readPublicEnv("VITE_SUPABASE_CUSTOM_HOST");
const RAW_SUPABASE_PROJECT_NAME = readPublicEnv("VITE_SUPABASE_PROJECT_NAME");
const EXPLICIT_SUPABASE_ANON_KEY = readPublicEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
);

const hasAnyExplicitSupabaseValue = Object.entries(importMetaEnv).some(
  ([key, value]) =>
    key.startsWith("VITE_SUPABASE_") && Boolean(normaliseEnvValue(value)),
);
const supabaseBuildFallback =
  !hasAnyExplicitSupabaseValue &&
  typeof __SUPABASE_BUILD_FALLBACK__ !== "undefined"
    ? __SUPABASE_BUILD_FALLBACK__
    : null;

const RAW_SUPABASE_URL = EXPLICIT_SUPABASE_URL ?? supabaseBuildFallback?.url;
const RAW_SUPABASE_PROJECT_ID =
  EXPLICIT_SUPABASE_PROJECT_ID ?? supabaseBuildFallback?.projectId;
const SUPABASE_ANON_KEY =
  EXPLICIT_SUPABASE_ANON_KEY ?? supabaseBuildFallback?.publishableKey;
const SUPABASE_CONFIGURATION_SOURCE = supabaseBuildFallback
  ? supabaseBuildFallback.configurationSource
  : hasAnyExplicitSupabaseValue
    ? "explicit"
    : "missing";

const normaliseHttpUrl = (rawValue: string | undefined): string | undefined => {
  if (!rawValue) return undefined;

  try {
    const url = new URL(rawValue);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
};

const SUPABASE_URL = normaliseHttpUrl(RAW_SUPABASE_URL);

const isLocalSupabaseHost = (hostname: string): boolean => {
  const unwrappedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return ["localhost", "127.0.0.1", "::1"].includes(unwrappedHostname);
};

const deriveProjectId = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const host = new URL(value).hostname;
    const match = /^([a-z0-9]{15,40})\.supabase\.co$/.exec(host);
    return match?.[1];
  } catch {
    return undefined;
  }
};

const DERIVED_PROJECT_ID = deriveProjectId(SUPABASE_URL);
const RESOLVED_PROJECT_ID = RAW_SUPABASE_PROJECT_ID ?? DERIVED_PROJECT_ID ?? "";

const deriveFunctionsUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/functions/v1`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
};

const SUPABASE_FUNCTIONS_URL = deriveFunctionsUrl(SUPABASE_URL);

const JWT_KEY_PATTERN = /^[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+\.[-A-Za-z0-9_=]+$/;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]+$/;

const readJwtRole = (value: string): string | null => {
  if (!JWT_KEY_PATTERN.test(value)) return null;

  try {
    const payload = value.split(".")[1];
    const base64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = globalThis.atob(base64);
    const parsed = JSON.parse(decoded) as {
      role?: unknown;
    };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
};

export const validatePublicSupabaseKey = (
  value: string | undefined,
): string | null => {
  if (!value) {
    return "Clé Supabase publique manquante (VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_ANON_KEY).";
  }

  const lower = value.toLowerCase();
  if (lower.startsWith("sb_secret_") || lower.startsWith("sb_service_role_")) {
    return "Une clé Supabase privilégiée a été refusée dans la configuration navigateur.";
  }

  if (PUBLISHABLE_KEY_PATTERN.test(value)) {
    return null;
  }

  if (JWT_KEY_PATTERN.test(value)) {
    return readJwtRole(value) === "anon"
      ? null
      : "Le JWT Supabase fourni au navigateur n'est pas une clé anon.";
  }

  return "La clé Supabase publique est invalide.";
};

export type PublicSupabaseTargetInput = {
  url: string | undefined;
  projectId?: string;
  customHost?: string;
};

export const validatePublicSupabaseTarget = ({
  url: rawUrl,
  projectId,
  customHost,
}: PublicSupabaseTargetInput): string[] => {
  if (!rawUrl) {
    return ["URL Supabase publique manquante (VITE_SUPABASE_URL)."];
  }

  const normalisedUrl = normaliseHttpUrl(rawUrl);
  if (!normalisedUrl) {
    return [
      "VITE_SUPABASE_URL doit être une URL HTTP(S) valide sans identifiants.",
    ];
  }

  const parsedUrl = new URL(normalisedUrl);
  const problems: string[] = [];
  const localHost = isLocalSupabaseHost(parsedUrl.hostname);
  const derivedProjectId = deriveProjectId(normalisedUrl);
  const hostedSupabaseDomain = parsedUrl.hostname
    .toLowerCase()
    .endsWith(".supabase.co");

  if (/example\.(com|org|net)$/i.test(parsedUrl.hostname)) {
    problems.push("VITE_SUPABASE_URL pointe vers un domaine d'exemple.");
  }

  if (!localHost && parsedUrl.protocol !== "https:") {
    problems.push("VITE_SUPABASE_URL doit utiliser HTTPS hors localhost.");
  }

  if (derivedProjectId) {
    if (!projectId) {
      problems.push(
        "VITE_SUPABASE_PROJECT_ID est obligatoire pour une URL *.supabase.co.",
      );
    } else if (projectId !== derivedProjectId) {
      problems.push(
        "VITE_SUPABASE_PROJECT_ID ne correspond pas exactement au projet de VITE_SUPABASE_URL.",
      );
    }
  } else if (hostedSupabaseDomain) {
    problems.push(
      "VITE_SUPABASE_URL contient une référence de projet Supabase invalide.",
    );
  } else if (!localHost) {
    if (!customHost) {
      problems.push(
        "VITE_SUPABASE_CUSTOM_HOST est obligatoire pour un domaine Supabase personnalisé.",
      );
    } else if (customHost !== parsedUrl.host) {
      problems.push(
        "VITE_SUPABASE_CUSTOM_HOST ne correspond pas exactement au domaine de VITE_SUPABASE_URL.",
      );
    }
  }

  return problems;
};

export type SupabaseDiagnostics = {
  configurationSource:
    | "explicit"
    | "vercel-preview-fallback"
    | "vercel-production-fallback"
    | "missing";
  initialisedAt: string;
  expectedProjectId: null;
  expectedProjectName: null;
  configuredProjectId: string | null;
  configuredProjectName: string | null;
  resolvedProjectId: string;
  resolvedProjectName: string;
  projectId: string | null;
  rawUrl: string | null;
  resolvedUrl: string | null;
  isPlaceholderUrl: boolean;
  functionsUrl: string | null;
  problems: string[];
};

declare global {
  interface Window {
    __SUPABASE_ENV_DIAG__?: SupabaseDiagnostics;
  }

  var __SUPABASE_CLIENT__: SupabaseClient<Database> | null | undefined;
  var __SUPABASE_ENV_DIAG__: SupabaseDiagnostics | undefined;
}

const buildEnvProblems = (): string[] => {
  const problems = validatePublicSupabaseTarget({
    url: RAW_SUPABASE_URL,
    projectId: RAW_SUPABASE_PROJECT_ID,
    customHost: RAW_SUPABASE_CUSTOM_HOST,
  });

  const keyProblem = validatePublicSupabaseKey(SUPABASE_ANON_KEY);
  if (keyProblem) problems.push(keyProblem);

  return problems;
};

type SupabaseInitialisation = {
  client: SupabaseClient<Database> | null;
  diagnostics: SupabaseDiagnostics;
};

const createSingletonClient = (): SupabaseInitialisation => {
  if (
    globalThis.__SUPABASE_CLIENT__ !== undefined &&
    globalThis.__SUPABASE_ENV_DIAG__
  ) {
    return {
      client: globalThis.__SUPABASE_CLIENT__,
      diagnostics: globalThis.__SUPABASE_ENV_DIAG__,
    };
  }

  const problems = buildEnvProblems();
  const diagnostics: SupabaseDiagnostics = {
    configurationSource: SUPABASE_CONFIGURATION_SOURCE,
    initialisedAt: new Date().toISOString(),
    expectedProjectId: null,
    expectedProjectName: null,
    configuredProjectId: RAW_SUPABASE_PROJECT_ID ?? null,
    configuredProjectName: RAW_SUPABASE_PROJECT_NAME ?? null,
    resolvedProjectId: RESOLVED_PROJECT_ID,
    resolvedProjectName: RAW_SUPABASE_PROJECT_NAME ?? RESOLVED_PROJECT_ID,
    projectId: RESOLVED_PROJECT_ID || null,
    rawUrl: RAW_SUPABASE_URL ?? null,
    resolvedUrl: SUPABASE_URL ?? null,
    isPlaceholderUrl: Boolean(
      SUPABASE_URL &&
        /example\.(com|org|net)$/i.test(new URL(SUPABASE_URL).hostname),
    ),
    functionsUrl: SUPABASE_FUNCTIONS_URL ?? null,
    problems,
  };

  globalThis.__SUPABASE_ENV_DIAG__ = diagnostics;
  if (typeof window !== "undefined") {
    window.__SUPABASE_ENV_DIAG__ = diagnostics;
  }

  if (problems.length > 0) {
    console.error(
      `Configuration Supabase publique refusée: ${problems.join(" | ")}`,
    );
    globalThis.__SUPABASE_CLIENT__ = null;
    return { client: null, diagnostics };
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
  });

  globalThis.__SUPABASE_CLIENT__ = client;
  return { client, diagnostics };
};

const { client: supabase, diagnostics: supabaseDiagnostics } =
  createSingletonClient();

export { supabase, supabaseDiagnostics };

export const isSupabaseConfigured = supabase !== null;
export const supabaseEnvProblems = supabaseDiagnostics.problems;
export const supabaseAnonKey = SUPABASE_ANON_KEY ?? null;
export const supabaseFunctionsUrl = SUPABASE_FUNCTIONS_URL ?? null;

export const resolveSupabaseFunctionUrl = (path: string): string | null => {
  if (!SUPABASE_FUNCTIONS_URL) return null;

  const base = SUPABASE_FUNCTIONS_URL.replace(/\/+$/, "");
  const relativePath = path.replace(/^\/+/, "");
  return relativePath ? `${base}/${relativePath}` : base;
};

export function requireSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      `Le client Supabase n'est pas initialisé. Vérifie la configuration publique: ${supabaseEnvProblems.join(" | ")}`,
    );
  }
  return supabase;
}
