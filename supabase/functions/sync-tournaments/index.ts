// Deno / Supabase Edge Function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.2?target=deno";
import { preflightIfOptions, withCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
}

const admin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const BLOCK_DURATION_MS = 1000 * 60 * 60 * 2; // 2 hours
const TOURNAMENTS_PER_BLOCK = 10;

type VariantCandidate = {
  ruleId: string;
  name: string;
  description: string | null;
  source: "lobby" | "fallback";
  lobbyId: string | null;
};

const FALLBACK_VARIANTS: VariantCandidate[] = [
  {
    ruleId: "preset_mov_01",
    name: "Voltus Hyper Knights",
    description: "Hyper aggressive format built around knight mobility.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_02",
    name: "Infinite Diagonals",
    description: "Long range battles that amplify bishop control.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_03",
    name: "Royal Tempest",
    description: "Fast paced pressure aimed directly at the opposing king.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_04",
    name: "Pawn Arena",
    description: "Pawns lead the offense with boosted move sets.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_05",
    name: "Voltus Blitz",
    description: "Lightning tempo crafted for tactical play.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_06",
    name: "Royal Fortress",
    description: "Reinforced defenses to shield the monarch.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_07",
    name: "Magnetic Center",
    description: "Central files apply directional bonuses and traps.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_08",
    name: "Quantum Gambit",
    description: "State shifts enable unexpected recaptures.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_09",
    name: "Voltus Squadron",
    description: "Rook formations unleash synchronized attacks.",
    source: "fallback",
    lobbyId: null,
  },
  {
    ruleId: "preset_mov_10",
    name: "Circuit Bishops",
    description: "Bishops gain mobility after every capture.",
    source: "fallback",
    lobbyId: null,
  },
];

const cloneVariant = (variant: VariantCandidate): VariantCandidate => ({
  ...variant,
});

const mergeVariantPools = (primary: VariantCandidate[]): VariantCandidate[] => {
  const seen = new Set<string>();
  const merged: VariantCandidate[] = [];

  for (const candidate of [...primary, ...FALLBACK_VARIANTS]) {
    if (!candidate.ruleId || seen.has(candidate.ruleId)) {
      continue;
    }

    merged.push(cloneVariant(candidate));
    seen.add(candidate.ruleId);
  }

  return merged.length > 0 ? merged : FALLBACK_VARIANTS.map(cloneVariant);
};

const floorToBlock = (date: Date): Date => {
  const ms = date.getTime();
  return new Date(Math.floor(ms / BLOCK_DURATION_MS) * BLOCK_DURATION_MS);
};

const addBlockDuration = (date: Date): Date =>
  new Date(date.getTime() + BLOCK_DURATION_MS);

const formatBlockLabel = (date: Date): string =>
  date.toISOString().slice(0, 13).replace(/[-:]/g, "");

const handleErrorResponse = (
  request: Request,
  error: unknown,
  status = 500,
) => {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.error("sync-tournaments error", message);
  return withCors(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
};

type LifecycleSummary = {
  completedToClosed: number;
  scheduledToActive: number;
  futureNormalised: number;
};

type BlockSummary = {
  start: string;
  end: string;
  ensured: number;
  created: number;
  status: "active" | "scheduled";
};

const syncLifecycle = async (now: Date): Promise<LifecycleSummary> => {
  if (!admin) {
    return { completedToClosed: 0, scheduledToActive: 0, futureNormalised: 0 };
  }

  const nowIso = now.toISOString();

  const [
    { count: completedToClosed = 0 },
    { count: scheduledToActive = 0 },
    { count: futureNormalised = 0 },
  ] = await Promise.all([
    (async () => {
      const { error } = await admin
        .from("tournaments")
        .update({ status: "completed" })
        .lt("ends_at", nowIso)
        .neq("status", "completed");

      if (error) {
        console.warn(
          "[sync-tournaments] Unable to mark completed tournaments:",
          error.message,
        );
        return { count: 0 };
      }

      const { count } = await admin
        .from("tournaments")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .lt("ends_at", nowIso);

      return { count: count ?? 0 };
    })(),
    (async () => {
      const { error } = await admin
        .from("tournaments")
        .update({ status: "active" })
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso)
        .neq("status", "active")
        .neq("status", "cancelled")
        .neq("status", "completed");

      if (error) {
        console.warn(
          "[sync-tournaments] Unable to promote tournaments to active:",
          error.message,
        );
        return { count: 0 };
      }

      const { count } = await admin
        .from("tournaments")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso);

      return { count: count ?? 0 };
    })(),
    (async () => {
      const { error } = await admin
        .from("tournaments")
        .update({ status: "scheduled" })
        .gt("starts_at", nowIso)
        .neq("status", "scheduled")
        .neq("status", "cancelled")
        .neq("status", "completed");

      if (error) {
        console.warn(
          "[sync-tournaments] Unable to normalise future tournaments:",
          error.message,
        );
        return { count: 0 };
      }

      const { count } = await admin
        .from("tournaments")
        .select("*", { count: "exact", head: true })
        .eq("status", "scheduled")
        .gt("starts_at", nowIso);

      return { count: count ?? 0 };
    })(),
  ]);

  return { completedToClosed, scheduledToActive, futureNormalised };
};

type ChessRuleVariantRow = {
  rule_id: string | null;
  rule_name: string | null;
  description: string | null;
  tags: unknown;
  status: string | null;
  category: string | null;
  usage_count: number | null;
  is_functional: boolean | null;
  source: string | null;
};

const fetchVariantPool = async (): Promise<VariantCandidate[]> => {
  if (!admin) {
    return FALLBACK_VARIANTS.map(cloneVariant);
  }

  try {
    const { data, error } = await admin
      .from("chess_rules")
      .select(
        "rule_id, rule_name, description, tags, status, is_functional, category, usage_count, source",
      )
      .in("source", ["custom", "ai_generated"])
      .eq("status", "active")
      .order("usage_count", { ascending: false, nullsFirst: false })
      .limit(60);

    if (error) {
      console.warn(
        "[sync-tournaments] Unable to load lobby variants:",
        error.message,
      );
      return FALLBACK_VARIANTS.map(cloneVariant);
    }

    const candidates = ((data ?? []) as ChessRuleVariantRow[])
      .filter((entry) => entry?.rule_id)
      .filter((entry) => (entry.is_functional ?? true) !== false)
      .filter((entry) => {
        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        if (
          tags.some((tag) => ["lobby", "tournament", "featured"].includes(tag))
        ) {
          return true;
        }
        return (
          typeof entry.category === "string" &&
          entry.category.toLowerCase().includes("variant")
        );
      })
      .map((entry) => ({
        ruleId: String(entry.rule_id),
        name:
          typeof entry.rule_name === "string" &&
          entry.rule_name.trim().length > 0
            ? entry.rule_name.trim()
            : `Variante ${entry.rule_id}`,
        description:
          typeof entry.description === "string" &&
          entry.description.trim().length > 0
            ? entry.description.trim()
            : null,
        source: "lobby" as const,
        lobbyId: null,
      }));

    return mergeVariantPools(candidates);
  } catch (error) {
    console.warn(
      "[sync-tournaments] Unexpected error while loading variants:",
      error,
    );
    return FALLBACK_VARIANTS.map(cloneVariant);
  }
};

const ensureBlockInventory = async (
  blockStart: Date,
  status: "active" | "scheduled",
  variantPool: VariantCandidate[],
  seedOffset: number,
): Promise<BlockSummary> => {
  if (!admin) {
    const blockEnd = addBlockDuration(blockStart);
    return {
      start: blockStart.toISOString(),
      end: blockEnd.toISOString(),
      ensured: 0,
      created: 0,
      status,
    };
  }

  const blockEnd = addBlockDuration(blockStart);
  const blockStartIso = blockStart.toISOString();
  const blockEndIso = blockEnd.toISOString();

  const { data: existing, error: existingError } = await admin
    .from("tournaments")
    .select("id, status")
    .gte("starts_at", blockStartIso)
    .lt("starts_at", blockEndIso);

  if (existingError) {
    throw new Error(
      `Unable to fetch tournaments for block: ${existingError.message}`,
    );
  }

  const existingCount = existing?.length ?? 0;
  const pool = variantPool.length > 0 ? variantPool : FALLBACK_VARIANTS;
  let cursor = seedOffset;
  const missing = Math.max(0, TOURNAMENTS_PER_BLOCK - existingCount);
  const newEntries: Array<Record<string, unknown>> = [];

  for (let index = 0; index < missing; index += 1) {
    const variant = pool[cursor % pool.length];
    cursor += 1;
    const ordinal = existingCount + index + 1;

    newEntries.push({
      title: `${variant.name} - Series ${formatBlockLabel(blockStart)} - ${ordinal}`,
      description:
        variant.description ?? `Theme tournament featuring ${variant.name}.`,
      variant_name: variant.name,
      variant_rules: [variant.ruleId],
      variant_source: variant.source,
      variant_lobby_id: variant.lobbyId,
      starts_at: blockStartIso,
      ends_at: blockEndIso,
      status,
    });
  }

  if (newEntries.length > 0) {
    const { error: insertError } = await admin
      .from("tournaments")
      .insert(newEntries);
    if (insertError) {
      throw new Error(
        `Unable to seed tournaments for block: ${insertError.message}`,
      );
    }
  }

  const { error: statusError } = await admin
    .from("tournaments")
    .update({ status })
    .gte("starts_at", blockStartIso)
    .lt("starts_at", blockEndIso)
    .neq("status", status)
    .neq("status", "cancelled")
    .neq("status", "completed");

  if (statusError) {
    throw new Error(
      `Unable to align tournament statuses for block: ${statusError.message}`,
    );
  }

  return {
    start: blockStartIso,
    end: blockEndIso,
    ensured: existingCount + newEntries.length,
    created: newEntries.length,
    status,
  };
};

serve(async (request: Request): Promise<Response> => {
  const preflight = preflightIfOptions(request);
  if (preflight) return preflight;

  if (request.method !== "POST") {
    return withCors(
      new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  if (!admin) {
    return withCors(
      new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const { tournamentId } = payload ?? {};

    if (tournamentId && typeof tournamentId !== "string") {
      return handleErrorResponse(request, "tournamentId must be a string", 400);
    }

    const variantPool = await fetchVariantPool();
    const now = new Date();

    const lifecycle = await syncLifecycle(now);

    const baseBlockStart = floorToBlock(now);
    const blockSummaries: BlockSummary[] = [];

    let cursor = Math.floor(
      Math.random() * (variantPool.length || FALLBACK_VARIANTS.length),
    );

    const activeSummary = await ensureBlockInventory(
      baseBlockStart,
      "active",
      variantPool,
      cursor,
    );
    cursor += activeSummary.created;
    blockSummaries.push(activeSummary);

    const nextBlockStart = addBlockDuration(baseBlockStart);
    const upcomingSummary = await ensureBlockInventory(
      nextBlockStart,
      "scheduled",
      variantPool,
      cursor,
    );
    cursor += upcomingSummary.created;
    blockSummaries.push(upcomingSummary);

    return withCors(
      new Response(
        JSON.stringify({
          ok: true,
          now: now.toISOString(),
          variantPoolSize: variantPool.length,
          lifecycle,
          blocks: blockSummaries,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  } catch (error) {
    return handleErrorResponse(request, error);
  }
});
