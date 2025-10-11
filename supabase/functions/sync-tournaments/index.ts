import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";

const corsOptions = { methods: ["POST"] };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase environment variables for sync-tournaments function");
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

type VariantSource = {
  name: string;
  rules: string[];
  source: "lobby" | "fallback";
  lobbyId?: string;
};

class FeatureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureUnavailableError";
  }
}

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

const isTournamentSchemaMissing = (error: PostgrestLikeError | null) => {
  if (!error) return false;

  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST302") {
    return true;
  }

  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";

  if (!message && !details) {
    return false;
  }

  const haystack = `${message} ${details}`;
  return haystack.includes("tournament") && (haystack.includes("not found") || haystack.includes("does not exist"));
};

const fallbackVariants: VariantSource[] = [
  { name: "Voltus Hyper Knights", rules: ["preset_mov_01", "preset_mov_07"], source: "fallback" },
  { name: "Tempête Royale", rules: ["preset_mov_05", "preset_mov_06"], source: "fallback" },
  { name: "Arène des Pions", rules: ["preset_mov_04", "preset_mov_10"], source: "fallback" },
  { name: "Diagonales Infinies", rules: ["preset_mov_02", "preset_mov_09"], source: "fallback" },
  { name: "Forteresse Agile", rules: ["preset_mov_03", "preset_mov_08"], source: "fallback" },
];

const normalizeVariant = (variant: VariantSource): VariantSource | null => {
  const name = typeof variant.name === "string" && variant.name.trim().length > 0
    ? variant.name.trim()
    : "Variante Voltus";

  const rules = Array.isArray(variant.rules)
    ? variant.rules
        .map(rule => {
          if (typeof rule === "string") return rule.trim();
          if (rule == null) return "";
          return String(rule).trim();
        })
        .filter((rule): rule is string => rule.length > 0)
    : [];

  if (rules.length === 0) {
    return null;
  }

  return {
    ...variant,
    name,
    rules,
  };
};

const blockDurationMs = 2 * 60 * 60 * 1000;
const tournamentSpacing = 10;

const computeBlockStart = (date: Date) => {
  const ms = date.getTime();
  const block = Math.floor(ms / blockDurationMs);
  return new Date(block * blockDurationMs);
};

const ensureStatusTransitions = async (nowIso: string) => {
  if (!supabase) return;

  const { error: toRunningError } = await supabase
    .from("tournaments")
    .update({ status: "running" })
    .lte("start_time", nowIso)
    .gt("end_time", nowIso)
    .neq("status", "running");

  if (toRunningError) {
    if (isTournamentSchemaMissing(toRunningError)) {
      throw new FeatureUnavailableError(
        "Les tables Supabase nécessaires aux tournois ne sont pas disponibles. Exécutez les migrations correspondantes.",
      );
    }
    throw toRunningError;
  }

  const { error: toCompletedError } = await supabase
    .from("tournaments")
    .update({ status: "completed" })
    .lte("end_time", nowIso)
    .neq("status", "completed");

  if (toCompletedError) {
    if (isTournamentSchemaMissing(toCompletedError)) {
      throw new FeatureUnavailableError(
        "Les tables Supabase nécessaires aux tournois ne sont pas disponibles. Exécutez les migrations correspondantes.",
      );
    }
    throw toCompletedError;
  }
};

const ensureBlockTournaments = async (blockStart: Date) => {
  if (!supabase) return { created: 0, tournaments: [] as unknown[] };

  const blockStartIso = blockStart.toISOString();
  const blockEnd = new Date(blockStart.getTime() + blockDurationMs);
  const blockEndIso = blockEnd.toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("tournaments")
    .select("*")
    .gte("start_time", blockStartIso)
    .lt("start_time", blockEndIso)
    .order("start_time", { ascending: true });

  if (existingError) {
    if (isTournamentSchemaMissing(existingError)) {
      throw new FeatureUnavailableError(
        "La table Supabase 'tournaments' est introuvable. Exécutez les migrations SQL pour activer les tournois.",
      );
    }
    console.error("Unable to fetch tournaments for block", existingError.message);
    throw existingError;
  }

  const existingCount = existing?.length ?? 0;
  if (existingCount >= tournamentSpacing) {
    return { created: 0, tournaments: existing ?? [] };
  }

  const missing = tournamentSpacing - existingCount;

  const { data: lobbyVariants, error: lobbyError } = await supabase
    .from("lobbies")
    .select("id, name, active_rules")
    .not("active_rules", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (lobbyError) {
    console.error("Unable to fetch lobby variants", lobbyError.message);
  }

  const pool: VariantSource[] = [];

  (lobbyVariants ?? []).forEach(lobby => {
    if (Array.isArray(lobby.active_rules) && lobby.active_rules.length > 0) {
      const normalized = normalizeVariant({
        name: lobby.name ?? "Variante communautaire",
        rules: lobby.active_rules,
        source: "lobby",
        lobbyId: lobby.id,
      });
      if (normalized) {
        pool.push(normalized);
      }
    }
  });

  const normalizedFallbacks = fallbackVariants
    .map(variant => normalizeVariant(variant))
    .filter((variant): variant is VariantSource => variant !== null);

  if (pool.length === 0) {
    pool.push(...normalizedFallbacks);
  } else {
    // Mix in a few curated variants to guarantee diversity
    pool.push(...normalizedFallbacks);
  }

  if (pool.length === 0) {
    console.warn("No tournament variants available after normalization");
    return { created: 0, tournaments: existing ?? [] };
  }

  const creations = [];
  const spacingMs = Math.floor(blockDurationMs / tournamentSpacing);

  for (let index = 0; index < missing; index += 1) {
    const variant = pool[Math.floor(Math.random() * pool.length)];
    const start = new Date(blockStart.getTime() + spacingMs * (existingCount + index));
    const end = new Date(start.getTime() + blockDurationMs);

    creations.push({
      name: `${variant.name} #${start.getUTCHours().toString().padStart(2, "0")}${start.getUTCMinutes().toString().padStart(2, "0")}`,
      description: variant.source === "lobby"
        ? `Variante issue du lobby « ${variant.name} »`
        : "Variante Voltus générée automatiquement",
      variant_name: variant.name,
      variant_rules: variant.rules,
      variant_source: variant.source,
      variant_lobby_id: variant.lobbyId ?? null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "scheduled",
    });
  }

  if (creations.length === 0) {
    return { created: 0, tournaments: existing ?? [] };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tournaments")
    .insert(creations)
    .select("*");

  if (insertError) {
    if (isTournamentSchemaMissing(insertError)) {
      throw new FeatureUnavailableError(
        "La table Supabase 'tournaments' est introuvable. Exécutez les migrations SQL pour activer les tournois.",
      );
    }
    console.error("Unable to create tournaments", insertError.message);
    throw insertError;
  }

  return {
    created: inserted?.length ?? 0,
    tournaments: [...(existing ?? []), ...(inserted ?? [])],
  };
};

serve(async req => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  if (req.method !== "POST") {
    return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
  }

  if (!supabase) {
    return jsonResponse(req, { error: "Supabase client not configured" }, { status: 500 }, corsOptions);
  }

  try {
    const now = new Date();
    const blockStart = computeBlockStart(now);
    const nextBlockStart = new Date(blockStart.getTime() + blockDurationMs);

    const results = [];
    results.push(await ensureBlockTournaments(blockStart));
    results.push(await ensureBlockTournaments(nextBlockStart));

    await ensureStatusTransitions(now.toISOString());

    const created = results.reduce((acc, current) => acc + (current.created ?? 0), 0);

    return jsonResponse(req, { created, ensuredBlocks: 2 }, { status: 200 }, corsOptions);
  } catch (error) {
    console.error("sync-tournaments error", error);
    if (error instanceof FeatureUnavailableError) {
      return jsonResponse(
        req,
        {
          error: error.message,
          code: "feature_unavailable",
        },
        { status: 503 },
        corsOptions,
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: message }, { status: 500 }, corsOptions);
  }
});
