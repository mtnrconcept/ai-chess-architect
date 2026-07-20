import { requireSupabaseClient } from "@/integrations/supabase/client";
import type { CreatedRuleLobby } from "@/rules-v2";

interface RpcError {
  message: string;
}

interface DynamicRpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: RpcError | null;
  }>;
}

interface FunctionEnvelope<T> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface RuleLobbySummary {
  lobbyId: string;
  lobbyName: string;
  creatorId: string;
  legacyRuleIds: string[];
  rulesetHash: string;
  engineVersion: string;
  status: "waiting" | "matched" | "cancelled";
  mode: "player" | "ai";
  createdAt: string;
}

export interface RuleLobbyRuntime {
  lobbyId: string;
  lobbyName: string;
  creatorId: string;
  opponentId: string | null;
  opponentName: string | null;
  mode: "player" | "ai";
  status: "matched";
  rulesetHash: string;
  engineVersion: string;
  matchSeed: number;
  rules: Array<{
    legacyRuleId: string;
    ruleJson: Record<string, unknown>;
    ordinal: number;
  }>;
}

export interface RuleLobbyDetails extends RuleLobbySummary {
  opponentId: string | null;
  opponentName: string | null;
  matchSeed: number | null;
  gameState: Record<string, unknown>;
  isParticipant: boolean;
}

const dynamicClient = (): DynamicRpcClient =>
  requireSupabaseClient() as unknown as DynamicRpcClient;

const firstRow = (data: unknown): Record<string, unknown> | null => {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const mapSummary = (row: Record<string, unknown>): RuleLobbySummary => ({
  lobbyId: String(row.lobby_id ?? ""),
  lobbyName: String(row.lobby_name ?? ""),
  creatorId: String(row.creator_id ?? ""),
  legacyRuleIds: stringArray(row.legacy_rule_ids),
  rulesetHash: String(row.ruleset_hash ?? ""),
  engineVersion: String(row.engine_version ?? "2.0.0"),
  status: String(row.status ?? "waiting") as RuleLobbySummary["status"],
  mode: String(row.mode ?? "player") as RuleLobbySummary["mode"],
  createdAt: String(row.created_at ?? ""),
});

export async function listRuleLobbies(): Promise<RuleLobbySummary[]> {
  const { data, error } = await dynamicClient().rpc("list_rule_lobbies_v2");

  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data : [])
    .filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row === "object"),
    )
    .map(mapSummary);
}

export async function getRuleLobby(
  lobbyId: string,
): Promise<RuleLobbyDetails | null> {
  const { data, error } = await dynamicClient().rpc("get_rule_lobby_v2", {
    p_lobby_id: lobbyId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = firstRow(data);
  if (!row) {
    return null;
  }

  return {
    ...mapSummary(row),
    opponentId: typeof row.opponent_id === "string" ? row.opponent_id : null,
    opponentName:
      typeof row.opponent_name === "string" ? row.opponent_name : null,
    matchSeed:
      typeof row.match_seed === "number"
        ? row.match_seed
        : typeof row.match_seed === "string"
          ? Number(row.match_seed)
          : null,
    gameState:
      row.game_state &&
      typeof row.game_state === "object" &&
      !Array.isArray(row.game_state)
        ? (row.game_state as Record<string, unknown>)
        : {},
    isParticipant: row.is_participant === true,
  };
}

export async function joinRuleLobby(
  lobbyId: string,
  displayName?: string,
): Promise<CreatedRuleLobby> {
  const client = requireSupabaseClient();
  const { data, error } = await client.functions.invoke("join-rule-lobby-v2", {
    body: {
      lobbyId,
      displayName,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const envelope = data as FunctionEnvelope<CreatedRuleLobby>;
  if (!envelope?.success || !envelope.data) {
    throw new Error(envelope?.error ?? "Impossible de rejoindre ce lobby.");
  }

  return envelope.data;
}

export async function cancelRuleLobby(lobbyId: string): Promise<void> {
  const { data, error } = await dynamicClient().rpc("cancel_rule_lobby_v2", {
    p_lobby_id: lobbyId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data !== true) {
    throw new Error("Ce lobby ne peut plus être annulé.");
  }
}

export async function getRuleLobbyRuntime(
  lobbyId: string,
): Promise<RuleLobbyRuntime> {
  const { data, error } = await dynamicClient().rpc(
    "get_rule_lobby_runtime_v2",
    {
      p_lobby_id: lobbyId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = firstRow(data);
  if (!row) {
    throw new Error("Le runtime du lobby n'est pas accessible.");
  }

  const rawRules = Array.isArray(row.rules) ? row.rules : [];

  const rules = rawRules
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item) => ({
      legacyRuleId: String(item.legacyRuleId ?? ""),
      ruleJson:
        item.ruleJson &&
        typeof item.ruleJson === "object" &&
        !Array.isArray(item.ruleJson)
          ? (item.ruleJson as Record<string, unknown>)
          : {},
      ordinal: Number(item.ordinal ?? 0),
    }))
    .sort((left, right) => left.ordinal - right.ordinal);

  const matchSeed = Number(row.match_seed);
  if (!Number.isSafeInteger(matchSeed)) {
    throw new Error("Le seed du lobby est invalide.");
  }

  return {
    lobbyId: String(row.lobby_id ?? ""),
    lobbyName: String(row.lobby_name ?? ""),
    creatorId: String(row.creator_id ?? ""),
    opponentId: typeof row.opponent_id === "string" ? row.opponent_id : null,
    opponentName:
      typeof row.opponent_name === "string" ? row.opponent_name : null,
    mode: String(row.mode ?? "player") as RuleLobbyRuntime["mode"],
    status: "matched",
    rulesetHash: String(row.ruleset_hash ?? ""),
    engineVersion: String(row.engine_version ?? "2.0.0"),
    matchSeed,
    rules,
  };
}
