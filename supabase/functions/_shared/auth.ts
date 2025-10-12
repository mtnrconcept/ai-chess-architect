import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const normalizeEnv = (value: string | undefined | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const SUPABASE_URL =
  normalizeEnv(Deno.env.get("SUPABASE_URL")) ??
  normalizeEnv(Deno.env.get("VITE_SUPABASE_URL"));

const SERVICE_ROLE_KEY =
  normalizeEnv(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ??
  normalizeEnv(Deno.env.get("SUPABASE_SERVICE_ROLE")) ??
  normalizeEnv(Deno.env.get("SERVICE_ROLE_KEY"));

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
