// Deno / Supabase Edge Function
// Dépendances standard
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// CORS utilitaires partagés
import { corsHeaders, okPreflight, withCors } from "../_shared/cors.ts";

// --- Chargement env
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
}

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

// --- Handler principal
serve(async (request: Request): Promise<Response> => {
  // 1) CORS preflight
  if (request.method === "OPTIONS") {
    return okPreflight(request);
  }

  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed" }),
        withCors(request, { status: 405, headers: { "Content-Type": "application/json" } }),
      );
    }

    if (!admin) {
      return new Response(
        JSON.stringify({ error: "Server misconfiguration" }),
        withCors(request, { status: 500, headers: { "Content-Type": "application/json" } }),
      );
    }

    // 2) Payload
    const payload = await request.json().catch(() => ({}));
    // Exemple: { tournamentId?: string } pour sync ciblée
    const { tournamentId } = payload ?? {};

    // 3) Vérifs de schéma minimales (évite PGRST205 si la table n’existe pas)
    // Astuce: une requête sur pg_catalog pour vérifier la présence de la table
    const { data: exists, error: existsErr } = await admin
      .rpc("check_table_exists", { schema_name: "public", table_name: "tournaments" });

    if (existsErr) {
      // Si la RPC n’existe pas, on tente un fallback direct (comptera sur l’erreur SQL en cas d’absence)
      console.warn("RPC check_table_exists missing, continuing without it:", existsErr.message);
    } else if (exists === false) {
      return new Response(
        JSON.stringify({
          error: "Schema missing",
          hint: "Table 'public.tournaments' introuvable. Applique la migration SQL qui crée la table.",
          code: "SCHEMA_MISSING",
        }),
        withCors(request, { status: 500, headers: { "Content-Type": "application/json" } }),
      );
    }

    // 4) Logique de sync — adapte selon ton besoin
    // Ici on s’assure que les tournois actifs sont propagés, qu’on (re)crée les rooms manquantes, etc.
    // Exemples d’opérations (à personnaliser) :

    // a) Récupérer le/les tournois
    let tournamentsQuery = admin.from("tournaments").select("*");
    if (tournamentId) tournamentsQuery = tournamentsQuery.eq("id", tournamentId);

    const { data: tournaments, error: tournamentsErr } = await tournamentsQuery;

    if (tournamentsErr) {
      return new Response(
        JSON.stringify({ error: tournamentsErr.message }),
        withCors(request, { status: 500, headers: { "Content-Type": "application/json" } }),
      );
    }

    // b) Exemple de traitement (no-op si à compléter)
    const processed = (tournaments ?? []).map((t) => ({
      id: t.id,
      status: t.status,
    }));

    return new Response(
      JSON.stringify({ ok: true, processedCount: processed.length, processed }),
      withCors(request, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  } catch (err) {
    console.error("sync-tournaments error", err);
    return new Response(
      JSON.stringify({ error: "Internal Error", detail: String(err?.message ?? err) }),
      withCors(request, { status: 500, headers: { "Content-Type": "application/json" } }),
    );
  }
});
