// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseServiceRoleClient } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const corsOptions = { methods: ["POST"] };

const respond = (req: Request, body: unknown, status = 200) =>
  jsonResponse(req, body, { status }, corsOptions);

const ok = (req: Request, body: unknown) => respond(req, body, 200);
const bad = (req: Request, body: unknown) => respond(req, body, 400);
const err = (req: Request, body: unknown, status = 500) => respond(req, body, status);

// --- ENV & client ---
const supabase = getSupabaseServiceRoleClient();

type FunctionLogLevel = "info" | "warning" | "error";

const writeFunctionLog = async (
  level: FunctionLogLevel,
  stage: string,
  details: Record<string, unknown> = {},
) => {
  if (!supabase) return;
  try {
    await supabase.from("tournament_function_logs").insert({
      function_name: "sync-tournaments",
      payload: {
        level,
        stage,
        ...details,
        recorded_at: new Date().toISOString(),
      },
    });
  } catch (loggingError) {
    console.error("[sync-tournaments] Unable to persist diagnostic log:", loggingError);
  }
};

// --- Types ---
type VariantSource = {
  name: string;
  rules: string[];
  source: "lobby" | "fallback";
  lobbyId?: string | null;
};

type TournamentRow = {
  id: string;
  start_time: string;
  variant_name: string | null;
};

type LobbyVariantRow = {
  id: string | null;
  name: string | null;
  active_rules: unknown;
};

type TournamentCreationPayload = {
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
const TOURNAMENTS_PER_BLOCK = 10; // 10 tournois simultanés par bloc

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
      await writeFunctionLog("error", "ensure_status_running_failed", {
        error: error.message,
        code: error.code,
      });
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
      await writeFunctionLog("error", "ensure_status_completed_failed", {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }
};

// --- Création idempotente des tournois d’un bloc ---
const ensureBlockTournaments = async (blockStart: Date) => {
  if (!supabase) return { created: 0, tournaments: [] as TournamentRow[] };

  const blockStartIso = blockStart.toISOString();
  const blockEndIso = new Date(blockStart.getTime() + BLOCK_MS).toISOString();

  // Récup existants dans ce block
  const { data: existing, error: existingError } = await supabase
    .from("tournaments")
    .select("id,start_time,variant_name")
    .gte("start_time", blockStartIso)
    .lt("start_time", blockEndIso)
    .order("start_time", { ascending: true })
    .returns<TournamentRow[]>();

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
    .limit(50)
    .returns<LobbyVariantRow[]>();

  if (lobbyError) {
    console.warn("[sync-tournaments] lobbies fetch error:", lobbyError.message);
    await writeFunctionLog("warning", "lobbies_fetch_failed", {
      error: lobbyError.message,
      code: lobbyError.code,
    });
  }

  const pool: VariantSource[] = [];
  (lobbyVariants ?? []).forEach((lobby) => {
    if (!lobby) return;
    const rules = Array.isArray(lobby.active_rules)
      ? lobby.active_rules
          .map((rule) => (typeof rule === "string" ? rule.trim() : ""))
          .filter((rule): rule is string => rule.length > 0)
      : [];
    if (rules.length === 0) return;

    const variant = normalizeVariant({
      name: typeof lobby.name === "string" ? lobby.name : "Variante communautaire",
      rules,
      source: "lobby",
      lobbyId: typeof lobby.id === "string" ? lobby.id : null,
    });
    if (variant) pool.push(variant);
  });

  const fall = fallbackVariants.map(normalizeVariant).filter((v): v is VariantSource => v !== null);
  if (pool.length === 0) pool.push(...fall);
  else pool.push(...fall); // mix de diversité

  if (pool.length === 0) return { created: 0, tournaments: existing ?? [] };

  const existingVariantNames = new Set(
    (existing ?? [])
      .map((t) => (t.variant_name ?? '').trim())
      .filter((name) => name.length > 0),
  );
  const variantUsage = new Map<string, number>();
  const creations: TournamentCreationPayload[] = [];

  const start = new Date(blockStart);
  const end = new Date(blockStart.getTime() + BLOCK_MS);

  const ensureUniqueVariantName = (rawName: string) => {
    const baseName = rawName.trim().length > 0 ? rawName.trim() : 'Variante Voltus';
    let suffix = variantUsage.get(baseName) ?? 0;
    let candidate = suffix === 0 ? baseName : `${baseName} #${suffix}`;

    while (existingVariantNames.has(candidate)) {
      suffix += 1;
      candidate = `${baseName} #${suffix}`;
    }

    variantUsage.set(baseName, suffix);
    return candidate;
  };

  for (let i = 0; i < TOURNAMENTS_PER_BLOCK - existingCount; i++) {
    const variant = pool[Math.floor(Math.random() * pool.length)];
    const uniqueVariantName = ensureUniqueVariantName(variant.name);
    existingVariantNames.add(uniqueVariantName);

    const blockLabel = `${start.getUTCHours().toString().padStart(2, '0')}${start.getUTCMinutes().toString().padStart(2, '0')}`;
    const sequenceNumber = (existingCount + i + 1).toString().padStart(2, '0');

    const payload = {
      name: `${uniqueVariantName} - ${blockLabel} - ${sequenceNumber}`,
      description:
        variant.source === 'lobby'
          ? `Variante issue du lobby "${variant.name}"`
          : 'Variante Voltus generee automatiquement',
      variant_name: uniqueVariantName,
      variant_rules: variant.rules,
      variant_source: variant.source,
      variant_lobby_id: variant.lobbyId ?? null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled' as const,
    };

    creations.push(payload);
  }

  if (creations.length === 0) return { created: 0, tournaments: existing ?? [] };

  // Idempotence: upsert sur clé unique (start_time, variant_name)
  const { data: upserted, error: upsertError } = await supabase
    .from("tournaments")
    .upsert(creations, { onConflict: "start_time,variant_name", ignoreDuplicates: false })
    .select("id,start_time,variant_name")
    .returns<TournamentRow[]>();

  if (upsertError) {
    if (isTournamentSchemaMissing(upsertError)) {
      throw new FeatureUnavailableError("Table 'tournaments' introuvable. Applique les migrations.");
    }
    await writeFunctionLog("error", "tournaments_upsert_failed", {
      error: upsertError.message,
      code: upsertError.code,
      creations: creations.length,
      blockStart: blockStartIso,
    });
    throw upsertError;
  }

  return { created: creations.length, tournaments: upserted ?? [] };
};

// --- Handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req, corsOptions);
  if (req.method !== "POST") return bad(req, { error: "Method not allowed" });

  if (!supabase) return err(req, { error: "Supabase client not configured" });

  try {
    const now = new Date();
    const blockStart = computeBlockStart(now);
    const nextBlockStart = new Date(blockStart.getTime() + BLOCK_MS);

    const r1 = await ensureBlockTournaments(blockStart);
    const r2 = await ensureBlockTournaments(nextBlockStart);

    await ensureStatusTransitions(now.toISOString());

    const created = (r1.created ?? 0) + (r2.created ?? 0);

    await writeFunctionLog("info", "sync_completed", {
      created,
      ensuredBlocks: 2,
      blockStart: blockStart.toISOString(),
      nextBlockStart: nextBlockStart.toISOString(),
    });

    return ok(req, { created, ensuredBlocks: 2 });
  } catch (unknownError) {
    const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
    console.error("[sync-tournaments] error:", error.message ?? error);
    await writeFunctionLog("error", "sync_failed", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    if (error instanceof FeatureUnavailableError) return err(req, { code: "feature_unavailable", error: error.message }, 503);
    return err(req, { error: error.message ?? "Unknown error" }, 500);
  }
});
