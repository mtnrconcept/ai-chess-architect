// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CORS minimal ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders } });

const ok = (body: unknown) => json(body, 200);
const bad = (body: unknown) => json(body, 400);
const err = (body: unknown, status = 500) => json(body, status);

// --- ENV & client ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[sync-tournaments] Missing Supabase env vars");
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

// --- Types ---
type VariantSource = {
  name: string;
  rules: string[];
  source: "lobby" | "fallback";
  lobbyId?: string | null;
};

type PostgrestLikeError = { code?: string; message?: string; details?: string };

class FeatureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureUnavailableError";
  }
}

// --- Helpers d’analyse d’erreurs ---
const isTournamentSchemaMissing = (error: PostgrestLikeError | null) => {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST302") return true;
  const m = (error.message ?? "").toLowerCase();
  const d = (error.details ?? "").toLowerCase();
  return (m + " " + d).includes("tournament") && ((m + " " + d).includes("not found") || (m + " " + d).includes("does not exist"));
};

// --- Variantes fallback (pour garantir la diversité) ---
const fallbackVariants: VariantSource[] = [
  { name: "Voltus Hyper Knights", rules: ["preset_mov_01", "preset_mov_07"], source: "fallback" },
  { name: "Tempête Royale", rules: ["preset_mov_05", "preset_mov_06"], source: "fallback" },
  { name: "Arène des Pions", rules: ["preset_mov_04", "preset_mov_10"], source: "fallback" },
  { name: "Diagonales Infinies", rules: ["preset_mov_02", "preset_mov_09"], source: "fallback" },
  { name: "Forteresse Agile", rules: ["preset_mov_03", "preset_mov_08"], source: "fallback" },
];

// --- Normalisation des variantes ---
const normalizeVariant = (variant: VariantSource): VariantSource | null => {
  const name =
    typeof variant.name === "string" && variant.name.trim().length > 0 ? variant.name.trim() : "Variante Voltus";
  const rules = Array.isArray(variant.rules)
    ? variant.rules
        .map((r) => (typeof r === "string" ? r.trim() : r == null ? "" : String(r).trim()))
        .filter((r): r is string => r.length > 0)
    : [];
  if (rules.length === 0) return null;
  return { ...variant, name, rules, lobbyId: variant.lobbyId ?? null };
};

// --- Paramétrage du calage temporel ---
const BLOCK_MS = 2 * 60 * 60 * 1000; // 2h
const TOURNAMENTS_PER_BLOCK = 10; // un toutes les ~12 minutes

const computeBlockStart = (d: Date) => new Date(Math.floor(d.getTime() / BLOCK_MS) * BLOCK_MS);

// --- Transitions d'état (scheduled -> running -> completed) ---
const ensureStatusTransitions = async (nowIso: string) => {
  if (!supabase) return;

  // scheduled -> running
  {
    const { error } = await supabase
      .from("tournaments")
      .update({ status: "running" })
      .lte("start_time", nowIso)
      .gt("end_time", nowIso)
      .neq("status", "running");
    if (error) {
      if (isTournamentSchemaMissing(error)) {
        throw new FeatureUnavailableError("Schéma tournois manquant. Exécute les migrations.");
      }
      throw error;
    }
  }

  // running -> completed
  {
    const { error } = await supabase.from("tournaments").update({ status: "completed" }).lte("end_time", nowIso).neq(
      "status",
      "completed",
    );
    if (error) {
      if (isTournamentSchemaMissing(error)) {
        throw new FeatureUnavailableError("Schéma tournois manquant. Exécute les migrations.");
      }
      throw error;
    }
  }
};

// --- Création idempotente des tournois d’un bloc ---
const ensureBlockTournaments = async (blockStart: Date) => {
  if (!supabase) return { created: 0, tournaments: [] as any[] };

  const blockStartIso = blockStart.toISOString();
  const blockEndIso = new Date(blockStart.getTime() + BLOCK_MS).toISOString();

  // Récup existants dans ce block
  const { data: existing, error: existingError } = await supabase
    .from("tournaments")
    .select("id,start_time,variant_name")
    .gte("start_time", blockStartIso)
    .lt("start_time", blockEndIso)
    .order("start_time", { ascending: true });

  if (existingError) {
    if (isTournamentSchemaMissing(existingError)) {
      throw new FeatureUnavailableError("Table/vues tournois introuvables. Applique les migrations.");
    }
    throw existingError;
  }

  const existingCount = existing?.length ?? 0;
  if (existingCount >= TOURNAMENTS_PER_BLOCK) {
    return { created: 0, tournaments: existing ?? [] };
  }

  // Source de variantes: lobbies + fallbacks
  const { data: lobbyVariants, error: lobbyError } = await supabase
    .from("lobbies")
    .select("id,name,active_rules")
    .not("active_rules", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (lobbyError) console.warn("[sync-tournaments] lobbies fetch error:", lobbyError.message);

  const pool: VariantSource[] = [];
  (lobbyVariants ?? []).forEach((l) => {
    if (Array.isArray((l as any).active_rules) && (l as any).active_rules.length > 0) {
      const v = normalizeVariant({
        name: (l as any).name ?? "Variante communautaire",
        rules: (l as any).active_rules,
        source: "lobby",
        lobbyId: (l as any).id,
      });
      if (v) pool.push(v);
    }
  });

  const fall = fallbackVariants.map(normalizeVariant).filter((v): v is VariantSource => v !== null);
  if (pool.length === 0) pool.push(...fall);
  else pool.push(...fall); // mix de diversité

  if (pool.length === 0) return { created: 0, tournaments: existing ?? [] };

  // Planning intra-bloc
  const spacingMs = Math.floor(BLOCK_MS / TOURNAMENTS_PER_BLOCK);
  const creations = [];

  for (let i = 0; i < TOURNAMENTS_PER_BLOCK - existingCount; i++) {
    const variant = pool[Math.floor(Math.random() * pool.length)];
    const start = new Date(blockStart.getTime() + spacingMs * (existingCount + i));
    const end = new Date(start.getTime() + BLOCK_MS);

    const payload = {
      name: `${variant.name} #${start.getUTCHours().toString().padStart(2, "0")}${start.getUTCMinutes().toString().padStart(2, "0")}`,
      description: variant.source === "lobby" ? `Variante issue du lobby « ${variant.name} »` : "Variante Voltus générée automatiquement",
      variant_name: variant.name,
      variant_rules: variant.rules, // jsonb côté DB
      variant_source: variant.source, // 'lobby' | 'fallback'
      variant_lobby_id: variant.lobbyId ?? null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "scheduled" as const,
    };

    creations.push(payload);
  }

  if (creations.length === 0) return { created: 0, tournaments: existing ?? [] };

  // Idempotence: upsert sur clé unique (start_time, variant_name)
  const { data: upserted, error: upsertError } = await supabase
    .from("tournaments")
    .upsert(creations, { onConflict: "start_time,variant_name", ignoreDuplicates: false })
    .select("id,start_time,variant_name");

  if (upsertError) {
    if (isTournamentSchemaMissing(upsertError)) {
      throw new FeatureUnavailableError("Table 'tournaments' introuvable. Applique les migrations.");
    }
    throw upsertError;
  }

  return { created: (upserted?.length ?? 0) - (existing?.length ?? 0) < 0 ? 0 : (upserted?.length ?? 0), tournaments: upserted ?? [] };
};

// --- Handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return bad({ error: "Method not allowed" });

  if (!supabase) return err({ error: "Supabase client not configured" });

  try {
    const now = new Date();
    const blockStart = computeBlockStart(now);
    const nextBlockStart = new Date(blockStart.getTime() + BLOCK_MS);

    const r1 = await ensureBlockTournaments(blockStart);
    const r2 = await ensureBlockTournaments(nextBlockStart);

    await ensureStatusTransitions(now.toISOString());

    const created = (r1.created ?? 0) + (r2.created ?? 0);
    return ok({ created, ensuredBlocks: 2 });
  } catch (e: any) {
    console.error("[sync-tournaments] error:", e?.message ?? e);
    if (e instanceof FeatureUnavailableError) return err({ code: "feature_unavailable", error: e.message }, 503);
    return err({ error: e?.message ?? "Unknown error" }, 500);
  }
});
