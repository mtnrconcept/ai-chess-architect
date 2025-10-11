// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) console.error("[sync-tournaments] Missing Supabase env vars");

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

type VariantCandidate = { name: string; rules: unknown; source: "lobby" | "fallback"; lobbyId?: string | null };
type VariantSource = { name: string; rules: string[]; source: "lobby" | "fallback"; lobbyId?: string | null };
type PostgrestLikeError = { code?: string; message?: string; details?: string };
type TournamentSummary = { id: string; start_time: string; variant_name: string };
type LobbyRecord = { id: string; name: string | null; active_rules: unknown };
type TournamentInsert = {
  name: string;
  description: string;
  variant_name: string;
  variant_rules: string[];
  variant_source: VariantSource["source"];
  variant_lobby_id: string | null;
  start_time: string;
  end_time: string;
  status: "scheduled";
};

class FeatureUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "FeatureUnavailableError"; }
}

const isTournamentSchemaMissing = (e: PostgrestLikeError | null) => {
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST302") return true;
  const m = (e.message ?? "").toLowerCase(), d = (e.details ?? "").toLowerCase();
  return (m + " " + d).includes("tournament") && ((m + " " + d).includes("not found") || (m + " " + d).includes("does not exist"));
};

const fallbackVariants: VariantCandidate[] = [
  { name: "Voltus Hyper Knights", rules: ["preset_mov_01", "preset_mov_07"], source: "fallback" },
  { name: "Tempête Royale", rules: ["preset_mov_05", "preset_mov_06"], source: "fallback" },
  { name: "Arène des Pions", rules: ["preset_mov_04", "preset_mov_10"], source: "fallback" },
  { name: "Diagonales Infinies", rules: ["preset_mov_02", "preset_mov_09"], source: "fallback" },
  { name: "Forteresse Agile", rules: ["preset_mov_03", "preset_mov_08"], source: "fallback" },
];

const normalizeVariant = (v: VariantCandidate): VariantSource | null => {
  const name = typeof v.name === "string" && v.name.trim() ? v.name.trim() : "Variante Voltus";
  const rules = Array.isArray(v.rules)
    ? v.rules.map(rule => (typeof rule === "string" ? rule.trim() : rule == null ? "" : String(rule).trim())).filter(rule => rule.length > 0)
    : [];
  if (!rules.length) return null;
  return { ...v, name, rules, lobbyId: v.lobbyId ?? null };
};

const BLOCK_MS = 2 * 60 * 60 * 1000;
const TOURNAMENTS_PER_BLOCK = 10;
const computeBlockStart = (d: Date) => new Date(Math.floor(d.getTime() / BLOCK_MS) * BLOCK_MS);

const ensureStatusTransitions = async (nowIso: string) => {
  if (!supabase) return;

  let r = await supabase.from("tournaments")
    .update({ status: "running" })
    .lte("start_time", nowIso).gt("end_time", nowIso).neq("status", "running");
  if (r.error) {
    if (isTournamentSchemaMissing(r.error)) throw new FeatureUnavailableError("Schéma tournois manquant. Exécute les migrations.");
    throw r.error;
  }

  r = await supabase.from("tournaments")
    .update({ status: "completed" })
    .lte("end_time", nowIso).neq("status", "completed");
  if (r.error) {
    if (isTournamentSchemaMissing(r.error)) throw new FeatureUnavailableError("Schéma tournois manquant. Exécute les migrations.");
    throw r.error;
  }
};

const ensureBlockTournaments = async (blockStart: Date): Promise<{ created: number; tournaments: TournamentSummary[] }> => {
  if (!supabase) return { created: 0, tournaments: [] };

  const startIso = blockStart.toISOString();
  const endIso = new Date(blockStart.getTime() + BLOCK_MS).toISOString();

  const existing = await supabase.from("tournaments")
    .select<TournamentSummary>("id,start_time,variant_name")
    .gte("start_time", startIso).lt("start_time", endIso)
    .order("start_time", { ascending: true });

  if (existing.error) {
    if (isTournamentSchemaMissing(existing.error)) throw new FeatureUnavailableError("Tables/vues tournois introuvables.");
    throw existing.error;
  }

  const existingCount = existing.data?.length ?? 0;
  if (existingCount >= TOURNAMENTS_PER_BLOCK) return { created: 0, tournaments: existing.data ?? [] };

  const lobbies = await supabase.from("lobbies")
    .select<LobbyRecord>("id,name,active_rules")
    .not("active_rules", "is", null)
    .order("updated_at", { ascending: false }).limit(50);

  if (lobbies.error) console.warn("[sync-tournaments] lobbies fetch error:", lobbies.error.message);

  const pool: VariantSource[] = [];
  (lobbies.data ?? []).forEach((lobby) => {
    if (Array.isArray(lobby.active_rules) && lobby.active_rules.length > 0) {
      const variant = normalizeVariant({
        name: lobby.name ?? "Variante communautaire",
        rules: lobby.active_rules,
        source: "lobby",
        lobbyId: lobby.id,
      });
      if (variant) pool.push(variant);
    }
  });
  const fallbacks = fallbackVariants.map(normalizeVariant).filter((v): v is VariantSource => v !== null);
  pool.push(...fallbacks);
  if (!pool.length) return { created: 0, tournaments: existing.data ?? [] };

  const spacing = Math.floor(BLOCK_MS / TOURNAMENTS_PER_BLOCK);
  const payloads: TournamentInsert[] = [];
  for (let i = 0; i < TOURNAMENTS_PER_BLOCK - existingCount; i++) {
    const v = pool[Math.floor(Math.random() * pool.length)];
    const s = new Date(blockStart.getTime() + spacing * (existingCount + i));
    const e = new Date(s.getTime() + BLOCK_MS);

    payloads.push({
      name: `${v.name} #${s.getUTCHours().toString().padStart(2, "0")}${s.getUTCMinutes().toString().padStart(2, "0")}`,
      description: v.source === "lobby" ? `Variante issue du lobby « ${v.name} »` : "Variante Voltus générée automatiquement",
      variant_name: v.name,
      variant_rules: v.rules,
      variant_source: v.source,
      variant_lobby_id: v.lobbyId ?? null,
      start_time: s.toISOString(),
      end_time: e.toISOString(),
      status: "scheduled",
    });
  }

  if (!payloads.length) return { created: 0, tournaments: existing.data ?? [] };

  const up = await supabase.from("tournaments")
    .upsert(payloads, { onConflict: "start_time,variant_name", ignoreDuplicates: false })
    .select<TournamentSummary>("id,start_time,variant_name");
  if (up.error) {
    if (isTournamentSchemaMissing(up.error)) throw new FeatureUnavailableError("Table 'tournaments' introuvable.");
    throw up.error;
  }
  return { created: up.data?.length ?? 0, tournaments: up.data ?? [] };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabase) return json({ error: "Supabase client not configured" }, 500);

  try {
    const now = new Date();
    const b0 = computeBlockStart(now);
    const b1 = new Date(b0.getTime() + BLOCK_MS);

    const r0 = await ensureBlockTournaments(b0);
    const r1 = await ensureBlockTournaments(b1);
    await ensureStatusTransitions(now.toISOString());

    return json({ created: (r0.created ?? 0) + (r1.created ?? 0), ensuredBlocks: 2 }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-tournaments] error:", message, error);
    if (error instanceof FeatureUnavailableError) return json({ code: "feature_unavailable", error: error.message }, 503);
    return json({ error: message }, 500);
  }
});
