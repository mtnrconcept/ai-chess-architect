import { requireSupabaseClient } from "@/integrations/supabase/client";

interface SupabaseErrorLike {
  message: string;
  code?: string;
}

interface RpcResult {
  data: unknown;
  error: SupabaseErrorLike | null;
}

interface QueryResult {
  data: unknown;
  error: SupabaseErrorLike | null;
}

interface DynamicQueryBuilder extends PromiseLike<QueryResult> {
  select(columns: string): DynamicQueryBuilder;
  eq(column: string, value: unknown): DynamicQueryBuilder;
  order(column: string, options: { ascending: boolean }): DynamicQueryBuilder;
  limit(count: number): DynamicQueryBuilder;
  maybeSingle(): PromiseLike<QueryResult>;
}

interface DynamicPlatformClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  from(name: string): DynamicQueryBuilder;
}

export interface ChessLeaderboardEntry {
  rank: number;
  userId: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  provisional: boolean;
}

export interface ServerDailyPuzzle {
  available: boolean;
  puzzleId: string | null;
  puzzleDate: string;
  title: string | null;
  fen: string | null;
  themes: string[];
  rating: number | null;
  attemptStatus: "started" | "solved" | "failed" | null;
  attemptCount: number;
}

export interface DailyPuzzleSubmission {
  solved: boolean;
  attemptStatus: "started" | "solved" | "failed";
  attemptCount: number;
  xpAwarded: number;
}

export interface ServerPlayerProgress {
  totalXp: number;
  level: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  puzzlesSolved: number;
  currentStreak: number;
  bestStreak: number;
  lastActivityOn: string | null;
}

export type ChessMatchmakingStatus =
  | "queued"
  | "matched"
  | "cancelled"
  | "expired";

export interface ChessMatchmakingResult {
  ticketId: string;
  status: ChessMatchmakingStatus;
  roomId: string | null;
  matchId: string | null;
}

export interface ChessMatchmakingTicket extends ChessMatchmakingResult {
  playerId: string;
  requestKey: string;
  rulesetType: "standard" | "custom";
  rated: boolean;
  initialSeconds: number;
  incrementSeconds: number;
  createdAt: string;
  expiresAt: string;
}

export interface OpenChessRoom {
  roomId: string;
  roomName: string;
  ownerId: string | null;
  rulesetType: "standard" | "custom";
  rulesetHash: string;
  rated: boolean;
  initialSeconds: number;
  incrementSeconds: number;
  waitingSince: string;
}

export interface CreatedChessRoom {
  roomId: string;
  rulesetHash: string;
  ownerColor: "white" | "black";
  status: "open" | "in_game" | "completed" | "cancelled";
}

export interface ChessRoomInvitation {
  invitationId: string;
  invitationToken: string;
  expiresAt: string;
}

export interface JoinedChessRoom {
  roomId: string;
  matchId: string | null;
  assignedColor: "white" | "black";
  roomStatus: "open" | "in_game" | "completed" | "cancelled";
}

export interface ChessRoomState {
  roomId: string;
  ownerId: string | null;
  name: string;
  visibility: "public" | "private" | "unlisted";
  status: "open" | "in_game" | "completed" | "cancelled";
  rulesetType: "standard" | "custom";
  rated: boolean;
  initialSeconds: number;
  incrementSeconds: number;
}

export interface ChessMatchState {
  matchId: string;
  roomId: string;
  status: "pending" | "active" | "completed" | "aborted";
  startedAt: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[0-9a-f]{16,128}$/i;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

const dynamicClient = (): DynamicPlatformClient =>
  requireSupabaseClient() as unknown as DynamicPlatformClient;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const rows = (value: unknown): Record<string, unknown>[] =>
  (Array.isArray(value) ? value : value == null ? [] : [value]).filter(
    isRecord,
  );

const firstRow = (value: unknown): Record<string, unknown> | null =>
  rows(value)[0] ?? null;

const safeInteger = (value: unknown, label: string, minimum = 0): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return parsed;
};

const nullableInteger = (value: unknown, label: string): number | null =>
  value == null ? null : safeInteger(value, label);

const stringValue = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return value;
};

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const booleanValue = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return value;
};

const uuidValue = (value: unknown, label: string): string => {
  const parsed = stringValue(value, label).toLowerCase();
  if (!UUID_PATTERN.test(parsed)) {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return parsed;
};

const nullableUuid = (value: unknown, label: string): string | null =>
  value == null ? null : uuidValue(value, label);

const dateTimeValue = (value: unknown, label: string): string => {
  const parsed = stringValue(value, label);
  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return parsed;
};

const enumValue = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return value as T;
};

const hashValue = (value: unknown, label: string): string => {
  const parsed = stringValue(value, label).toLowerCase();
  if (!HASH_PATTERN.test(parsed)) {
    throw new Error(`${label} invalide dans la réponse serveur.`);
  }
  return parsed;
};

const puzzleStatus = (value: unknown): ServerDailyPuzzle["attemptStatus"] => {
  if (value == null) return null;
  if (value === "started" || value === "solved" || value === "failed") {
    return value;
  }
  throw new Error("Statut de puzzle invalide dans la réponse serveur.");
};

const throwIfError = (error: SupabaseErrorLike | null, fallback: string) => {
  if (error) {
    const suffix = error.code ? ` (${error.code})` : "";
    throw new Error(`${fallback}${suffix} : ${error.message}`);
  }
};

export function neutralPlayerLabel(userId: string): string {
  const compact = userId.replace(/-/g, "").toUpperCase();
  return `Joueur ${compact.slice(0, 4)}-${compact.slice(-4)}`;
}

export async function getChessLeaderboard(
  limit = 100,
): Promise<ChessLeaderboardEntry[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error(
      "La limite du classement doit être comprise entre 1 et 200.",
    );
  }

  const result = await dynamicClient().rpc("get_chess_leaderboard", {
    p_season_id: null,
    p_limit: limit,
  });
  throwIfError(result.error, "Chargement du classement impossible");

  return rows(result.data).map((row) => {
    const userId = uuidValue(row.user_id, "user_id");
    const gamesPlayed = safeInteger(row.games_played, "games_played");
    const wins = safeInteger(row.wins, "wins");
    const draws = safeInteger(row.draws, "draws");
    const losses = safeInteger(row.losses, "losses");
    if (gamesPlayed !== wins + draws + losses) {
      throw new Error("Statistiques incohérentes dans le classement serveur.");
    }

    return {
      rank: safeInteger(row.rank, "rank", 1),
      userId,
      rating: safeInteger(row.rating, "rating"),
      gamesPlayed,
      wins,
      draws,
      losses,
      provisional: booleanValue(row.provisional, "provisional"),
    };
  });
}

export async function getServerDailyPuzzle(
  date: string,
): Promise<ServerDailyPuzzle> {
  if (!DATE_PATTERN.test(date)) {
    throw new Error("La date du puzzle doit être au format YYYY-MM-DD.");
  }

  const result = await dynamicClient().rpc("get_daily_chess_puzzle", {
    p_date: date,
  });
  throwIfError(result.error, "Chargement du puzzle quotidien impossible");
  const row = firstRow(result.data);
  if (!row || typeof row.available !== "boolean") {
    throw new Error("Réponse du puzzle quotidien invalide.");
  }

  const puzzleDate = stringValue(row.puzzle_date, "puzzle_date");
  if (!DATE_PATTERN.test(puzzleDate)) {
    throw new Error("puzzle_date invalide dans la réponse serveur.");
  }

  if (!row.available) {
    return {
      available: false,
      puzzleId: null,
      puzzleDate,
      title: null,
      fen: null,
      themes: [],
      rating: null,
      attemptStatus: null,
      attemptCount: 0,
    };
  }

  const themes = Array.isArray(row.themes)
    ? row.themes.filter((theme): theme is string => typeof theme === "string")
    : [];

  return {
    available: true,
    puzzleId: uuidValue(row.puzzle_id, "puzzle_id"),
    puzzleDate,
    title: nullableString(row.title),
    fen: stringValue(row.fen, "fen"),
    themes,
    rating: nullableInteger(row.rating, "rating"),
    attemptStatus: puzzleStatus(row.attempt_status),
    attemptCount: safeInteger(row.attempt_count, "attempt_count"),
  };
}

export async function submitServerDailyPuzzle(
  puzzleId: string,
  moves: string[],
  durationMs: number | null,
): Promise<DailyPuzzleSubmission> {
  if (!UUID_PATTERN.test(puzzleId))
    throw new Error("Identifiant de puzzle invalide.");
  if (moves.length < 1 || moves.length > 64) {
    throw new Error("Une tentative doit contenir entre 1 et 64 coups.");
  }
  if (
    durationMs !== null &&
    (!Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > 86_400_000)
  ) {
    throw new Error("Durée de tentative invalide.");
  }

  const result = await dynamicClient().rpc("submit_daily_chess_puzzle", {
    p_puzzle_id: puzzleId,
    p_moves: moves,
    p_duration_ms: durationMs,
  });
  throwIfError(result.error, "Validation du puzzle impossible");
  const row = firstRow(result.data);
  if (!row || typeof row.solved !== "boolean") {
    throw new Error("Réponse de validation du puzzle invalide.");
  }
  const status = puzzleStatus(row.attempt_status);
  if (!status) throw new Error("Statut de tentative manquant.");

  return {
    solved: row.solved,
    attemptStatus: status,
    attemptCount: safeInteger(row.attempt_count, "attempt_count"),
    xpAwarded: safeInteger(row.xp_awarded, "xp_awarded"),
  };
}

export async function getServerPlayerProgress(
  userId: string,
): Promise<ServerPlayerProgress | null> {
  if (!UUID_PATTERN.test(userId))
    throw new Error("Identifiant joueur invalide.");

  const result = await dynamicClient()
    .from("chess_player_progress")
    .select(
      "total_xp, level, games_played, wins, draws, losses, puzzles_solved, current_streak, best_streak, last_activity_on",
    )
    .eq("user_id", userId)
    .maybeSingle();
  throwIfError(result.error, "Chargement de la progression impossible");
  if (result.data == null) return null;
  if (!isRecord(result.data)) {
    throw new Error("Réponse de progression invalide.");
  }

  const row = result.data;
  const gamesPlayed = safeInteger(row.games_played, "games_played");
  const wins = safeInteger(row.wins, "wins");
  const draws = safeInteger(row.draws, "draws");
  const losses = safeInteger(row.losses, "losses");
  if (gamesPlayed !== wins + draws + losses) {
    throw new Error("Statistiques de progression incohérentes.");
  }

  return {
    totalXp: safeInteger(row.total_xp, "total_xp"),
    level: safeInteger(row.level, "level", 1),
    gamesPlayed,
    wins,
    draws,
    losses,
    puzzlesSolved: safeInteger(row.puzzles_solved, "puzzles_solved"),
    currentStreak: safeInteger(row.current_streak, "current_streak"),
    bestStreak: safeInteger(row.best_streak, "best_streak"),
    lastActivityOn:
      row.last_activity_on == null
        ? null
        : stringValue(row.last_activity_on, "last_activity_on"),
  };
}

const MATCHMAKING_STATUSES = [
  "queued",
  "matched",
  "cancelled",
  "expired",
] as const;
const ROOM_STATUSES = ["open", "in_game", "completed", "cancelled"] as const;
const RULESET_TYPES = ["standard", "custom"] as const;
const ROOM_VISIBILITIES = ["public", "private", "unlisted"] as const;
const PLAYER_COLORS = ["white", "black"] as const;
const MATCH_STATUSES = ["pending", "active", "completed", "aborted"] as const;

const validateRequestKey = (requestKey: string) => {
  if (!UUID_PATTERN.test(requestKey)) {
    throw new Error("Clé de requête invalide.");
  }
};

const validateTimeControl = (
  initialSeconds: number,
  incrementSeconds: number,
) => {
  if (
    !Number.isSafeInteger(initialSeconds) ||
    initialSeconds < 30 ||
    initialSeconds > 604_800 ||
    !Number.isSafeInteger(incrementSeconds) ||
    incrementSeconds < 0 ||
    incrementSeconds > 3_600
  ) {
    throw new Error("Cadence invalide pour le serveur multijoueur.");
  }
};

const matchmakingResultFromRow = (
  row: Record<string, unknown> | null,
): ChessMatchmakingResult => {
  if (!row) throw new Error("Réponse de matchmaking vide.");
  const status = enumValue(
    row.ticket_status ?? row.status,
    MATCHMAKING_STATUSES,
    "ticket_status",
  );
  const matchId = nullableUuid(
    row.match_id ?? row.matched_match_id,
    "match_id",
  );
  if (status === "matched" && !matchId) {
    throw new Error("Match manquant dans la réponse de matchmaking.");
  }
  return {
    ticketId: uuidValue(row.ticket_id ?? row.id, "ticket_id"),
    status,
    roomId: nullableUuid(row.room_id ?? row.matched_room_id, "room_id"),
    matchId,
  };
};

const matchmakingTicketFromRow = (
  row: Record<string, unknown>,
): ChessMatchmakingTicket => ({
  ...matchmakingResultFromRow(row),
  playerId: uuidValue(row.player_id, "player_id"),
  requestKey: uuidValue(row.request_key, "request_key"),
  rulesetType: enumValue(row.ruleset_type, RULESET_TYPES, "ruleset_type"),
  rated: booleanValue(row.rated, "rated"),
  initialSeconds: safeInteger(row.initial_seconds, "initial_seconds", 30),
  incrementSeconds: safeInteger(row.increment_seconds, "increment_seconds"),
  createdAt: dateTimeValue(row.created_at, "created_at"),
  expiresAt: dateTimeValue(row.expires_at, "expires_at"),
});

export async function enqueueStandardMatchmaking(input: {
  requestKey: string;
  initialSeconds: number;
  incrementSeconds?: number;
}): Promise<ChessMatchmakingResult> {
  const incrementSeconds = input.incrementSeconds ?? 0;
  validateRequestKey(input.requestKey);
  validateTimeControl(input.initialSeconds, incrementSeconds);

  const result = await dynamicClient().rpc("enqueue_chess_matchmaking", {
    p_request_key: input.requestKey,
    p_rule_version_ids: [],
    p_rated: false,
    p_initial_seconds: input.initialSeconds,
    p_increment_seconds: incrementSeconds,
    p_rating_window: 200,
  });
  throwIfError(result.error, "Entrée dans la file impossible");
  return matchmakingResultFromRow(firstRow(result.data));
}

export async function cancelChessMatchmaking(
  ticketId: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(ticketId)) {
    throw new Error("Identifiant de ticket invalide.");
  }
  const result = await dynamicClient().rpc("cancel_chess_matchmaking", {
    p_ticket_id: ticketId,
  });
  throwIfError(result.error, "Annulation de la file impossible");
  return booleanValue(result.data, "cancel_chess_matchmaking");
}

const MATCHMAKING_TICKET_COLUMNS =
  "id, player_id, request_key, status, ruleset_type, rated, initial_seconds, increment_seconds, matched_room_id, matched_match_id, created_at, expires_at";

export async function getChessMatchmakingTicket(
  ticketId: string,
): Promise<ChessMatchmakingTicket | null> {
  if (!UUID_PATTERN.test(ticketId)) {
    throw new Error("Identifiant de ticket invalide.");
  }
  const result = await dynamicClient()
    .from("chess_matchmaking_tickets")
    .select(MATCHMAKING_TICKET_COLUMNS)
    .eq("id", ticketId)
    .maybeSingle();
  throwIfError(result.error, "Lecture du ticket impossible");
  if (result.data == null) return null;
  if (!isRecord(result.data)) throw new Error("Réponse de ticket invalide.");
  return matchmakingTicketFromRow(result.data);
}

export async function getLatestChessMatchmakingTicket(
  userId: string,
): Promise<ChessMatchmakingTicket | null> {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("Identifiant joueur invalide.");
  }
  const result = await dynamicClient()
    .from("chess_matchmaking_tickets")
    .select(MATCHMAKING_TICKET_COLUMNS)
    .eq("player_id", userId)
    .eq("status", "queued")
    .maybeSingle();
  throwIfError(result.error, "Lecture du ticket actif impossible");
  if (result.data == null) return null;
  if (!isRecord(result.data)) throw new Error("Réponse de ticket invalide.");
  if (result.data.status !== "queued") return null;
  const ticket = matchmakingTicketFromRow(result.data);
  return Date.parse(ticket.expiresAt) <= Date.now() ? null : ticket;
}

export async function listOpenChessRooms(limit = 50): Promise<OpenChessRoom[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("La limite des salles doit être comprise entre 1 et 100.");
  }
  const result = await dynamicClient().rpc("list_open_chess_rooms", {
    p_limit: limit,
  });
  throwIfError(result.error, "Chargement des salles impossible");
  return rows(result.data).map((row) => ({
    roomId: uuidValue(row.room_id, "room_id"),
    roomName: stringValue(row.room_name, "room_name"),
    ownerId: nullableUuid(row.owner_id, "owner_id"),
    rulesetType: enumValue(row.ruleset_type, RULESET_TYPES, "ruleset_type"),
    rulesetHash: hashValue(row.ruleset_hash, "ruleset_hash"),
    rated: booleanValue(row.rated, "rated"),
    initialSeconds: safeInteger(row.initial_seconds, "initial_seconds", 30),
    incrementSeconds: safeInteger(row.increment_seconds, "increment_seconds"),
    waitingSince: dateTimeValue(row.waiting_since, "waiting_since"),
  }));
}

export async function createStandardChessRoom(input: {
  name: string;
  visibility: "public" | "private";
  requestKey: string;
  initialSeconds: number;
  incrementSeconds?: number;
  ownerColor?: "white" | "black" | "random";
}): Promise<CreatedChessRoom> {
  const name = input.name.trim();
  const incrementSeconds = input.incrementSeconds ?? 0;
  if (name.length < 3 || name.length > 80) {
    throw new Error(
      "Le nom de la salle doit contenir entre 3 et 80 caractères.",
    );
  }
  validateRequestKey(input.requestKey);
  validateTimeControl(input.initialSeconds, incrementSeconds);

  const result = await dynamicClient().rpc("create_chess_room", {
    p_name: name,
    p_visibility: input.visibility,
    p_request_key: input.requestKey,
    p_rule_version_ids: [],
    p_rated: false,
    p_initial_seconds: input.initialSeconds,
    p_increment_seconds: incrementSeconds,
    p_owner_color: input.ownerColor ?? "random",
  });
  throwIfError(result.error, "Création de la salle impossible");
  const row = firstRow(result.data);
  if (!row) throw new Error("Réponse de création de salle vide.");
  return {
    roomId: uuidValue(row.room_id, "room_id"),
    rulesetHash: hashValue(row.ruleset_hash, "ruleset_hash"),
    ownerColor: enumValue(row.owner_color, PLAYER_COLORS, "owner_color"),
    status: enumValue(row.status, ROOM_STATUSES, "status"),
  };
}

export async function createChessRoomInvitation(
  roomId: string,
): Promise<ChessRoomInvitation> {
  if (!UUID_PATTERN.test(roomId))
    throw new Error("Identifiant de salle invalide.");
  const result = await dynamicClient().rpc("create_chess_room_invitation", {
    p_room_id: roomId,
    p_invitee_id: null,
    p_ttl_minutes: 1_440,
  });
  throwIfError(result.error, "Création de l’invitation impossible");
  const row = firstRow(result.data);
  if (!row) throw new Error("Réponse d’invitation vide.");
  const invitationToken = stringValue(
    row.invitation_token,
    "invitation_token",
  ).toLowerCase();
  if (!INVITATION_TOKEN_PATTERN.test(invitationToken)) {
    throw new Error("Jeton d’invitation invalide dans la réponse serveur.");
  }
  return {
    invitationId: uuidValue(row.invitation_id, "invitation_id"),
    invitationToken,
    expiresAt: dateTimeValue(row.expires_at, "expires_at"),
  };
}

export async function joinChessRoom(
  roomId: string,
  invitationToken: string | null = null,
): Promise<JoinedChessRoom> {
  if (!UUID_PATTERN.test(roomId))
    throw new Error("Identifiant de salle invalide.");
  const normalizedToken = invitationToken?.trim().toLowerCase() || null;
  if (normalizedToken && !INVITATION_TOKEN_PATTERN.test(normalizedToken)) {
    throw new Error("Jeton d’invitation invalide.");
  }
  const result = await dynamicClient().rpc("join_chess_room", {
    p_room_id: roomId,
    p_invitation_token: normalizedToken,
  });
  throwIfError(result.error, "Impossible de rejoindre la salle");
  const row = firstRow(result.data);
  if (!row) throw new Error("Réponse de salle vide.");
  return {
    roomId: uuidValue(row.room_id, "room_id"),
    matchId: nullableUuid(row.match_id, "match_id"),
    assignedColor: enumValue(
      row.assigned_color,
      PLAYER_COLORS,
      "assigned_color",
    ),
    roomStatus: enumValue(row.room_status, ROOM_STATUSES, "room_status"),
  };
}

export async function getChessRoom(
  roomId: string,
): Promise<ChessRoomState | null> {
  if (!UUID_PATTERN.test(roomId))
    throw new Error("Identifiant de salle invalide.");
  const result = await dynamicClient()
    .from("chess_rooms")
    .select(
      "id, owner_id, name, visibility, status, ruleset_type, rated, initial_seconds, increment_seconds",
    )
    .eq("id", roomId)
    .maybeSingle();
  throwIfError(result.error, "Lecture de la salle impossible");
  if (result.data == null) return null;
  if (!isRecord(result.data)) throw new Error("Réponse de salle invalide.");
  const row = result.data;
  return {
    roomId: uuidValue(row.id, "id"),
    ownerId: nullableUuid(row.owner_id, "owner_id"),
    name: stringValue(row.name, "name"),
    visibility: enumValue(row.visibility, ROOM_VISIBILITIES, "visibility"),
    status: enumValue(row.status, ROOM_STATUSES, "status"),
    rulesetType: enumValue(row.ruleset_type, RULESET_TYPES, "ruleset_type"),
    rated: booleanValue(row.rated, "rated"),
    initialSeconds: safeInteger(row.initial_seconds, "initial_seconds", 30),
    incrementSeconds: safeInteger(row.increment_seconds, "increment_seconds"),
  };
}

export async function getChessMatchByRoom(
  roomId: string,
): Promise<ChessMatchState | null> {
  if (!UUID_PATTERN.test(roomId))
    throw new Error("Identifiant de salle invalide.");
  const result = await dynamicClient()
    .from("chess_matches")
    .select("id, room_id, status, started_at")
    .eq("room_id", roomId)
    .maybeSingle();
  throwIfError(result.error, "Lecture du match impossible");
  if (result.data == null) return null;
  if (!isRecord(result.data)) throw new Error("Réponse de match invalide.");
  const row = result.data;
  return {
    matchId: uuidValue(row.id, "id"),
    roomId: uuidValue(row.room_id, "room_id"),
    status: enumValue(row.status, MATCH_STATUSES, "status"),
    startedAt:
      row.started_at == null
        ? null
        : dateTimeValue(row.started_at, "started_at"),
  };
}
