import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

type ErrorResponse = { error: string };

type LoadGamesResponse = {
  games: Array<Record<string, unknown>>;
};

type LoadGamesPayload = {
  userId?: string | null;
} | null;

const corsOptions = { methods: ["POST"] };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase configuration for load-user-games function");
}

const adminClient = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  if (req.method !== "POST") {
    return jsonResponse<LoadGamesResponse | ErrorResponse>(
      req,
      { error: "Method not allowed" },
      { status: 405 },
      corsOptions,
    );
  }

  if (!adminClient) {
    return jsonResponse<LoadGamesResponse | ErrorResponse>(
      req,
      { error: "Supabase client misconfigured" },
      { status: 500 },
      corsOptions,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return jsonResponse<LoadGamesResponse | ErrorResponse>(
        req,
        { error: "Session utilisateur requise" },
        { status: 401 },
        corsOptions,
      );
    }

    const body = await req.json().catch(() => null) as LoadGamesPayload;

    const { data: authData, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !authData?.user?.id) {
      const message = authError?.message ?? "Impossible de vérifier l'utilisateur";
      return jsonResponse<LoadGamesResponse | ErrorResponse>(
        req,
        { error: message },
        { status: 401 },
        corsOptions,
      );
    }

    const userId = authData.user.id;

    if (body?.userId && body.userId !== userId) {
      return jsonResponse<LoadGamesResponse | ErrorResponse>(
        req,
        { error: "L'utilisateur authentifié ne correspond pas à la requête" },
        { status: 403 },
        corsOptions,
      );
    }

    const { data, error } = await adminClient
      .from("user_games")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load-user-games query error", error);
      return jsonResponse<LoadGamesResponse | ErrorResponse>(
        req,
        { error: "Impossible de récupérer les parties" },
        { status: 500 },
        corsOptions,
      );
    }

    return jsonResponse<LoadGamesResponse | ErrorResponse>(
      req,
      { games: data ?? [] },
      { status: 200 },
      corsOptions,
    );
  } catch (error) {
    console.error("load-user-games unexpected error", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return jsonResponse<LoadGamesResponse | ErrorResponse>(
      req,
      { error: message },
      { status: 500 },
      corsOptions,
    );
  }
});
