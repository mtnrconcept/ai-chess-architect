// supabase/functions/sync-tournaments/index.ts
// Deno Deploy / Supabase Edge Function – robuste & verbeuse pour diag

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(status: number, body: Json) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const requestId = crypto.randomUUID();

  try {
    // --- ENV required ---
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("[sync-tournaments] missing env", {
        requestId,
        hasUrl: !!SUPABASE_URL,
        hasServiceRole: !!SERVICE_ROLE_KEY,
      });
      return jsonResponse(500, {
        ok: false,
        requestId,
        error: "SYNC_TOURNAMENTS_MISSING_ENV",
        hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets, then redeploy the function.",
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Request-Id": requestId } },
    });

    // --- Parse payload (optionnel) ---
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Exemple: { mode: "full" | "delta" }
    const mode = (payload.mode as string) ?? "full";

    // --- Sanity check DB objects existent ---
    // Si la table n'existe pas, PostgREST renverra 404 → on remonte un message clair
    const { error: probeErr } = await supabase.from("tournaments").select("id").limit(1);
    if (probeErr) {
      console.error("[sync-tournaments] probe error", { requestId, probeErr });
      return jsonResponse(500, {
        ok: false,
        requestId,
        error: "SCHEMA_MISSING",
        hint:
          "Table 'public.tournaments' introuvable. Applique les migrations et/ou déclenche 'select pg_notify('pgrst','reload schema')'.",
        details: probeErr.message ?? probeErr,
      });
    }

    // --- Exemple de sync: upsert des tournois calculés côté app (mock) ---
    // Remplace par ta logique réelle (lecture depuis une source, etc.)
    const toUpsert = [
      { name: "Open Neo-Geneva", starts_at: new Date().toISOString() },
    ];

    const { data: upserted, error: upsertErr } = await supabase
      .from("tournaments")
      .upsert(toUpsert, { onConflict: "name" })
      .select();

    if (upsertErr) {
      console.error("[sync-tournaments] upsert error", { requestId, upsertErr });
      return jsonResponse(500, {
        ok: false,
        requestId,
        error: "UPSERT_FAILED",
        details: upsertErr.message ?? upsertErr,
      });
    }

    // (Optionnel) notifier PostgREST de recharger le schéma si tu as créé des objets dynamiquement
    // await supabase.rpc('emit_pgrst_reload'); // si tu exposes une RPC dédiée

    return jsonResponse(200, {
      ok: true,
      requestId,
      mode,
      count: upserted?.length ?? 0,
    });
  } catch (e) {
    console.error("[sync-tournaments] fatal", { requestId, e });
    return jsonResponse(500, {
      ok: false,
      requestId,
      error: "UNHANDLED_EXCEPTION",
      details: e instanceof Error ? e.message : String(e),
    });
  }
});
