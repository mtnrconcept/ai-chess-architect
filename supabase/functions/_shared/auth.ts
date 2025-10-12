import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const normalizeEnv = (value: string | undefined | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const EXPECTED_PROJECT_ID = "ucaqbhmyutlnitnedowk";
const EXPECTED_PROJECT_NAME = "Youaregood";

const rawSupabaseUrl =
  normalizeEnv(Deno.env.get("SUPABASE_URL")) ??
  normalizeEnv(Deno.env.get("VITE_SUPABASE_URL"));
const configuredProjectId =
  normalizeEnv(Deno.env.get("SUPABASE_PROJECT_ID")) ??
  normalizeEnv(Deno.env.get("SUPABASE_PROJECT_REF")) ??
  normalizeEnv(Deno.env.get("SUPABASE_REFERENCE_ID")) ??
  normalizeEnv(Deno.env.get("VITE_SUPABASE_PROJECT_ID")) ??
  normalizeEnv(Deno.env.get("VITE_SUPABASE_PROJECT_REF")) ??
  normalizeEnv(Deno.env.get("VITE_SUPABASE_REFERENCE_ID"));
const configuredProjectName =
  normalizeEnv(Deno.env.get("SUPABASE_PROJECT_NAME")) ??
  normalizeEnv(Deno.env.get("VITE_SUPABASE_PROJECT_NAME"));

const resolvedProjectId = configuredProjectId ?? EXPECTED_PROJECT_ID;
const resolvedProjectName = configuredProjectName ?? EXPECTED_PROJECT_NAME;

const SUPABASE_URL = rawSupabaseUrl ?? `https://${resolvedProjectId}.supabase.co`;

const SERVICE_ROLE_KEY =
  normalizeEnv(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ??
  normalizeEnv(Deno.env.get("SUPABASE_SERVICE_ROLE")) ??
  normalizeEnv(Deno.env.get("SERVICE_ROLE_KEY"));

type SupabaseProjectDiagnostics = {
  expectedProjectId: string;
  expectedProjectName: string;
  configuredProjectId: string | null;
  configuredProjectName: string | null;
  resolvedProjectId: string;
  resolvedProjectName: string;
  resolvedUrl: string | null;
  serviceRoleConfigured: boolean;
  urlConfigured: boolean;
};

const diagnostics: SupabaseProjectDiagnostics = {
  expectedProjectId: EXPECTED_PROJECT_ID,
  expectedProjectName: EXPECTED_PROJECT_NAME,
  configuredProjectId: configuredProjectId ?? null,
  configuredProjectName: configuredProjectName ?? null,
  resolvedProjectId,
  resolvedProjectName,
  resolvedUrl: SUPABASE_URL ?? null,
  serviceRoleConfigured: !!SERVICE_ROLE_KEY,
  urlConfigured: !!rawSupabaseUrl,
};

const globalScope = globalThis as typeof globalThis & {
  __YOUAREGOOD_SUPABASE_DIAGNOSTICS__?: SupabaseProjectDiagnostics;
  __YOUAREGOOD_SUPABASE_LOGGED__?: boolean;
};

if (!globalScope.__YOUAREGOOD_SUPABASE_DIAGNOSTICS__) {
  globalScope.__YOUAREGOOD_SUPABASE_DIAGNOSTICS__ = diagnostics;
}

if (!globalScope.__YOUAREGOOD_SUPABASE_LOGGED__) {
  const messages: string[] = [];

  if (configuredProjectId && configuredProjectId !== EXPECTED_PROJECT_ID) {
    messages.push(
      `Identifiant de projet inattendu (${configuredProjectId}). Les fonctions ciblent ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_ID}).`
    );
  }

  if (configuredProjectName && configuredProjectName !== EXPECTED_PROJECT_NAME) {
    messages.push(
      `Nom de projet inattendu (${configuredProjectName}). Utilisation forcée de ${EXPECTED_PROJECT_NAME}.`
    );
  }

  if (!configuredProjectId) {
    messages.push(
      `Aucun identifiant de projet fourni. Utilisation du projet Supabase ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_ID}).`
    );
  }

  if (!rawSupabaseUrl) {
    messages.push(
      `SUPABASE_URL absent. URL dérivée: https://${resolvedProjectId}.supabase.co.`
    );
  }

  if (!SERVICE_ROLE_KEY) {
    messages.push(
      "Clé de rôle de service manquante (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE/SERVICE_ROLE_KEY)."
    );
  }

  if (messages.length > 0) {
    console.warn(`[Youaregood] ${messages.join(" ")}`);
  } else {
    console.log(`[Youaregood] Fonctions configurées pour ${resolvedProjectName} (${resolvedProjectId}).`);
  }

  globalScope.__YOUAREGOOD_SUPABASE_LOGGED__ = true;
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase configuration for function authentication (SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE)"
  );
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

type AuthSuccess = {
  success: true;
  user: User;
};

type AuthFailure = {
  success: false;
  status: number;
  error: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

export const supabaseProjectDiagnostics = () =>
  globalScope.__YOUAREGOOD_SUPABASE_DIAGNOSTICS__ ?? diagnostics;

export const authenticateRequest = async (req: Request): Promise<AuthResult> => {
  if (!supabase) {
    return {
      success: false,
      status: 500,
      error: "Supabase client misconfigured",
    };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      success: false,
      status: 401,
      error: "Missing or invalid authorization header",
    };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return {
      success: false,
      status: 401,
      error: "Missing access token",
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return {
      success: false,
      status: 401,
      error: error?.message ?? "Unable to verify user",
    };
  }

  return {
    success: true,
    user: data.user,
  };
};

export const getSupabaseServiceRoleClient = () => supabase;
