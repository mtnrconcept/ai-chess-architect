import {
  createClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2";

const normalizeEnv = (value: string | undefined | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const EXPECTED_PROJECT_ID = "pfcaolibtgvynnwaxvol";
const EXPECTED_PROJECT_NAME = "AI Chess Architect";

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

const SUPABASE_URL =
  rawSupabaseUrl ?? `https://${resolvedProjectId}.supabase.co`;

const SERVICE_ROLE_KEY =
  normalizeEnv(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ??
  normalizeEnv(Deno.env.get("SUPABASE_SERVICE_ROLE")) ??
  normalizeEnv(Deno.env.get("SERVICE_ROLE_KEY"));

const PUBLIC_PUBLISHABLE_KEYS = [
  Deno.env.get("SUPABASE_ANON_KEY"),
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
  Deno.env.get("SUPABASE_PUBLISHABLE_DEFAULT_KEY"),
  Deno.env.get("VITE_SUPABASE_ANON_KEY"),
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY"),
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY"),
  Deno.env.get("VITE_ANON_KEY"),
]
  .map(normalizeEnv)
  .filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

const PUBLIC_KEY_SET = new Set(PUBLIC_PUBLISHABLE_KEYS);

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
  __LOVABLE_CLOUD_SUPABASE_DIAGNOSTICS__?: SupabaseProjectDiagnostics;
  __LOVABLE_CLOUD_SUPABASE_LOGGED__?: boolean;
};

if (!globalScope.__LOVABLE_CLOUD_SUPABASE_DIAGNOSTICS__) {
  globalScope.__LOVABLE_CLOUD_SUPABASE_DIAGNOSTICS__ = diagnostics;
}

if (!globalScope.__LOVABLE_CLOUD_SUPABASE_LOGGED__) {
  const messages: string[] = [];

  if (configuredProjectId && configuredProjectId !== EXPECTED_PROJECT_ID) {
    messages.push(
      `Identifiant de projet inattendu (${configuredProjectId}). Les fonctions ciblent ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_ID}).`,
    );
  }

  if (
    configuredProjectName &&
    configuredProjectName !== EXPECTED_PROJECT_NAME
  ) {
    messages.push(
      `Nom de projet inattendu (${configuredProjectName}). Utilisation forcée de ${EXPECTED_PROJECT_NAME}.`,
    );
  }

  if (!configuredProjectId) {
    messages.push(
      `Aucun identifiant de projet fourni. Utilisation du projet Supabase ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_ID}).`,
    );
  }

  if (!rawSupabaseUrl) {
    messages.push(
      `SUPABASE_URL absent. URL dérivée: https://${resolvedProjectId}.supabase.co.`,
    );
  }

  if (!SERVICE_ROLE_KEY) {
    messages.push(
      "Clé de rôle de service manquante (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE/SERVICE_ROLE_KEY).",
    );
  }

  if (messages.length > 0) {
    console.warn(`[${EXPECTED_PROJECT_NAME}] ${messages.join(" ")}`);
  } else {
    console.log(
      `[${EXPECTED_PROJECT_NAME}] Fonctions configurées pour ${resolvedProjectName} (${resolvedProjectId}).`,
    );
  }

  globalScope.__LOVABLE_CLOUD_SUPABASE_LOGGED__ = true;
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase configuration for function authentication (SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE)",
  );
}

const supabase =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null;

type AuthSuccess = {
  success: true;
  user: User | null;
  isGuest: boolean;
};

type AuthFailure = {
  success: false;
  status: number;
  error: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

export const supabaseProjectDiagnostics = () =>
  globalScope.__LOVABLE_CLOUD_SUPABASE_DIAGNOSTICS__ ?? diagnostics;

export const resolvedSupabaseUrl = SUPABASE_URL;
export const resolvedServiceRoleKey = SERVICE_ROLE_KEY;

export const authenticateRequest = async (
  req: Request,
): Promise<AuthResult> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    if (PUBLIC_KEY_SET.size > 0) {
      // Autorise les requêtes publiques lorsqu'aucun token utilisateur n'est fourni.
      return { success: true, user: null, isGuest: true };
    }

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

  if (PUBLIC_KEY_SET.has(token)) {
    // Les clés publishable/anon ne correspondent pas à un utilisateur mais doivent pouvoir accéder aux fonctions
    // pour le mode preview ou les visiteurs non connectés.
    return { success: true, user: null, isGuest: true };
  }

  if (!supabase) {
    return {
      success: false,
      status: 500,
      error: "Supabase client misconfigured",
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
    isGuest: false,
  };
};

export const getSupabaseServiceRoleClient = () => supabase;
