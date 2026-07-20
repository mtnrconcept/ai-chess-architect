import type {
  AnyPersistedMatchEvent,
  JsonValue,
  MatchEventPayloadMap,
  MatchEventType,
  MatchIdentity,
  MatchMove,
  MatchParticipant,
  MatchResult,
  MatchSide,
  MultiplayerMatchSnapshot,
  MultiplayerPhase,
  ServerClockAnchor,
} from "./contracts";
import { normalizeMatchIdentity } from "./identity";

export class MatchContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchContractError";
  }
}

const EVENT_TYPES = new Set<MatchEventType>([
  "match.waiting",
  "match.started",
  "move.committed",
  "participant.connected",
  "participant.disconnected",
  "match.paused",
  "match.resumed",
  "match.finished",
  "match.abandoned",
]);

const SNAPSHOT_PHASES = new Set<MultiplayerMatchSnapshot["phase"]>([
  "waiting",
  "playing",
  "paused",
  "finished",
  "abandoned",
]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const field = (
  record: Record<string, unknown>,
  camelCase: string,
  snakeCase = camelCase,
): unknown => record[camelCase] ?? record[snakeCase];

const stringField = (
  value: unknown,
  label: string,
  maxLength = 512,
): string => {
  if (typeof value !== "string") {
    throw new MatchContractError(`${label} doit être une chaîne.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new MatchContractError(`${label} est vide ou trop long.`);
  }
  return normalized;
};

const nullableString = (
  value: unknown,
  label: string,
  maxLength = 512,
): string | null =>
  value === null || value === undefined
    ? null
    : stringField(value, label, maxLength);

const integerField = (value: unknown, label: string, minimum = 0): number => {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (
    typeof numeric !== "number" ||
    !Number.isSafeInteger(numeric) ||
    numeric < minimum
  ) {
    throw new MatchContractError(`${label} doit être un entier sûr.`);
  }
  return numeric;
};

export const parseIsoTimestamp = (value: unknown, label: string): string => {
  const timestamp = stringField(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) {
    throw new MatchContractError(`${label} n'est pas un timestamp ISO.`);
  }
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new MatchContractError(`${label} n'est pas un timestamp ISO.`);
  }
  return timestamp;
};

const nullableIsoTimestamp = (value: unknown, label: string): string | null =>
  value === null || value === undefined
    ? null
    : parseIsoTimestamp(value, label);

const parseSide = (value: unknown, label: string): MatchSide => {
  if (value !== "white" && value !== "black") {
    throw new MatchContractError(`${label} doit valoir white ou black.`);
  }
  return value;
};

const parseNullableSide = (value: unknown, label: string): MatchSide | null =>
  value === null || value === undefined ? null : parseSide(value, label);

const isJsonValue = (
  value: unknown,
  depth = 0,
  budget = { nodes: 0 },
): boolean => {
  budget.nodes += 1;
  if (depth > 16 || budget.nodes > 10_000) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item, depth + 1, budget));
  }
  if (isRecord(value)) {
    return Object.entries(value).every(
      ([key, item]) =>
        key.length <= 128 && isJsonValue(item, depth + 1, budget),
    );
  }
  return false;
};

export const parseMatchIdentity = (value: unknown): MatchIdentity => {
  if (!isRecord(value)) {
    throw new MatchContractError("L'identité du match est absente.");
  }
  const rawMatchSeed = field(value, "matchSeed", "match_seed");
  if (typeof rawMatchSeed !== "string" && typeof rawMatchSeed !== "number") {
    throw new MatchContractError("matchSeed doit être un entier décimal.");
  }
  return normalizeMatchIdentity({
    matchId: stringField(field(value, "matchId", "match_id"), "matchId"),
    lobbyId: stringField(field(value, "lobbyId", "lobby_id"), "lobbyId"),
    rulesetHash: stringField(
      field(value, "rulesetHash", "ruleset_hash"),
      "rulesetHash",
    ),
    matchSeed: rawMatchSeed,
    engineVersion: stringField(
      field(value, "engineVersion", "engine_version"),
      "engineVersion",
      64,
    ),
  });
};

export const parseServerClockAnchor = (value: unknown): ServerClockAnchor => {
  if (!isRecord(value)) {
    throw new MatchContractError("L'ancre d'horloge est absente.");
  }
  return {
    whiteRemainingMs: integerField(
      field(value, "whiteRemainingMs", "white_remaining_ms"),
      "whiteRemainingMs",
    ),
    blackRemainingMs: integerField(
      field(value, "blackRemainingMs", "black_remaining_ms"),
      "blackRemainingMs",
    ),
    activeSide: parseNullableSide(
      field(value, "activeSide", "active_side"),
      "activeSide",
    ),
    turnStartedAt: nullableIsoTimestamp(
      field(value, "turnStartedAt", "turn_started_at"),
      "turnStartedAt",
    ),
    pausedAt: nullableIsoTimestamp(
      field(value, "pausedAt", "paused_at"),
      "pausedAt",
    ),
    serverNow: parseIsoTimestamp(
      field(value, "serverNow", "server_now"),
      "serverNow",
    ),
  };
};

const parseParticipant = (value: unknown): MatchParticipant => {
  if (!isRecord(value)) {
    throw new MatchContractError("Participant invalide.");
  }
  const connected = field(value, "connected");
  if (typeof connected !== "boolean") {
    throw new MatchContractError("participant.connected doit être booléen.");
  }
  return {
    userId: stringField(field(value, "userId", "user_id"), "userId", 128),
    side: parseSide(field(value, "side"), "participant.side"),
    displayName:
      nullableString(
        field(value, "displayName", "display_name"),
        "displayName",
        80,
      ) ?? undefined,
    connected,
    lastSeenAt: nullableIsoTimestamp(
      field(value, "lastSeenAt", "last_seen_at"),
      "lastSeenAt",
    ),
  };
};

const parseParticipants = (value: unknown): MatchParticipant[] => {
  if (!Array.isArray(value) || value.length > 2) {
    throw new MatchContractError("La liste des participants est invalide.");
  }
  const participants = value.map(parseParticipant);
  if (
    new Set(participants.map((item) => item.userId)).size !==
    participants.length
  ) {
    throw new MatchContractError("Un participant est dupliqué.");
  }
  if (
    new Set(participants.map((item) => item.side)).size !== participants.length
  ) {
    throw new MatchContractError("Un camp est attribué deux fois.");
  }
  return participants;
};

export const parseMatchMove = (value: unknown): MatchMove => {
  if (!isRecord(value)) {
    throw new MatchContractError("Le coup est invalide.");
  }
  const promotion = field(value, "promotion");
  if (
    promotion !== undefined &&
    promotion !== null &&
    !["queen", "rook", "bishop", "knight"].includes(String(promotion))
  ) {
    throw new MatchContractError("La promotion est invalide.");
  }
  const ruleState = field(value, "ruleState", "rule_state");
  if (ruleState !== undefined && !isJsonValue(ruleState)) {
    throw new MatchContractError(
      "L'état du moteur de règles n'est pas un JSON borné.",
    );
  }

  const from = stringField(field(value, "from"), "move.from", 8);
  const to = stringField(field(value, "to"), "move.to", 8);
  if (!/^[a-h][1-8]$/i.test(from) || !/^[a-h][1-8]$/i.test(to)) {
    throw new MatchContractError("Les coordonnées du coup sont invalides.");
  }

  return {
    ply: integerField(field(value, "ply"), "move.ply", 1),
    side: parseSide(field(value, "side"), "move.side"),
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    uci: stringField(field(value, "uci"), "move.uci", 8).toLowerCase(),
    san: nullableString(field(value, "san"), "move.san", 32) ?? undefined,
    promotion:
      promotion === undefined || promotion === null
        ? undefined
        : (promotion as MatchMove["promotion"]),
    durationMs:
      field(value, "durationMs", "duration_ms") === undefined
        ? undefined
        : integerField(
            field(value, "durationMs", "duration_ms"),
            "move.durationMs",
          ),
    fenBefore:
      nullableString(
        field(value, "fenBefore", "fen_before"),
        "move.fenBefore",
        256,
      ) ?? undefined,
    fenAfter:
      nullableString(
        field(value, "fenAfter", "fen_after"),
        "move.fenAfter",
        256,
      ) ?? undefined,
    positionHash: stringField(
      field(value, "positionHash", "position_hash"),
      "move.positionHash",
      128,
    ),
    ruleState: ruleState as JsonValue | undefined,
    ruleStateHash:
      nullableString(
        field(value, "ruleStateHash", "rule_state_hash"),
        "move.ruleStateHash",
        128,
      ) ?? undefined,
  };
};

const parseResult = (value: unknown): MatchResult => {
  if (!isRecord(value)) {
    throw new MatchContractError("Le résultat est invalide.");
  }
  const reason = field(value, "reason");
  const reasons: MatchResult["reason"][] = [
    "checkmate",
    "stalemate",
    "draw",
    "timeout",
    "resignation",
    "abandonment",
    "server",
  ];
  if (!reasons.includes(reason as MatchResult["reason"])) {
    throw new MatchContractError("La raison de fin de partie est invalide.");
  }
  return {
    winner: parseNullableSide(field(value, "winner"), "result.winner"),
    reason: reason as MatchResult["reason"],
  };
};

const parsePayload = <Type extends MatchEventType>(
  type: Type,
  value: unknown,
): MatchEventPayloadMap[Type] => {
  if (!isRecord(value)) {
    throw new MatchContractError(`Payload ${type} invalide.`);
  }

  let parsed: MatchEventPayloadMap[MatchEventType];
  switch (type) {
    case "match.waiting":
      parsed = {
        participants: parseParticipants(field(value, "participants")),
        clock:
          field(value, "clock") === null || field(value, "clock") === undefined
            ? null
            : parseServerClockAnchor(field(value, "clock")),
      };
      break;
    case "match.started":
      parsed = {
        participants: parseParticipants(field(value, "participants")),
        currentSide: parseSide(
          field(value, "currentSide", "current_side"),
          "currentSide",
        ),
        clock: parseServerClockAnchor(field(value, "clock")),
        initialPositionHash: stringField(
          field(value, "initialPositionHash", "initial_position_hash"),
          "initialPositionHash",
          128,
        ),
      };
      break;
    case "move.committed":
      parsed = {
        move: parseMatchMove(field(value, "move")),
        nextSide: parseSide(field(value, "nextSide", "next_side"), "nextSide"),
        clock: parseServerClockAnchor(field(value, "clock")),
      };
      break;
    case "participant.connected":
      parsed = {
        userId: stringField(field(value, "userId", "user_id"), "userId", 128),
        side: parseSide(field(value, "side"), "side"),
        observedAt: parseIsoTimestamp(
          field(value, "observedAt", "observed_at"),
          "observedAt",
        ),
      };
      break;
    case "participant.disconnected":
      parsed = {
        userId: stringField(field(value, "userId", "user_id"), "userId", 128),
        side: parseSide(field(value, "side"), "side"),
        observedAt: parseIsoTimestamp(
          field(value, "observedAt", "observed_at"),
          "observedAt",
        ),
        graceExpiresAt: parseIsoTimestamp(
          field(value, "graceExpiresAt", "grace_expires_at"),
          "graceExpiresAt",
        ),
      };
      break;
    case "match.paused": {
      const reason = field(value, "reason");
      if (!(["disconnect", "server", "manual"] as unknown[]).includes(reason)) {
        throw new MatchContractError("La raison de pause est invalide.");
      }
      parsed = {
        reason: reason as MatchEventPayloadMap["match.paused"]["reason"],
        clock: parseServerClockAnchor(field(value, "clock")),
      };
      break;
    }
    case "match.resumed":
      parsed = {
        currentSide: parseSide(
          field(value, "currentSide", "current_side"),
          "currentSide",
        ),
        clock: parseServerClockAnchor(field(value, "clock")),
      };
      break;
    case "match.finished":
      parsed = {
        result: parseResult(field(value, "result")),
        clock: parseServerClockAnchor(field(value, "clock")),
        finalPositionHash: stringField(
          field(value, "finalPositionHash", "final_position_hash"),
          "finalPositionHash",
          128,
        ),
      };
      break;
    case "match.abandoned":
      parsed = {
        abandonedBy: stringField(
          field(value, "abandonedBy", "abandoned_by"),
          "abandonedBy",
          128,
        ),
        result: parseResult(field(value, "result")),
        clock: parseServerClockAnchor(field(value, "clock")),
      };
      break;
  }

  return parsed as MatchEventPayloadMap[Type];
};

const identityFromRow = (row: Record<string, unknown>): MatchIdentity => {
  const nested = field(row, "identity");
  if (isRecord(nested)) return parseMatchIdentity(nested);
  return parseMatchIdentity(row);
};

export const parsePersistedMatchEvent = (
  value: unknown,
): AnyPersistedMatchEvent => {
  if (!isRecord(value)) {
    throw new MatchContractError("Événement multijoueur invalide.");
  }
  const rawType = field(value, "type", "event_type");
  if (
    typeof rawType !== "string" ||
    !EVENT_TYPES.has(rawType as MatchEventType)
  ) {
    throw new MatchContractError("Type d'événement multijoueur inconnu.");
  }
  const type = rawType as MatchEventType;
  const sequence = integerField(field(value, "sequence"), "sequence", 1);
  const revision = integerField(field(value, "revision"), "revision");
  if (sequence !== revision + 1) {
    throw new MatchContractError(
      "La séquence de l'événement est incompatible avec sa révision.",
    );
  }
  return {
    eventId: stringField(field(value, "eventId", "event_id"), "eventId", 128),
    clientEventId: nullableString(
      field(value, "clientEventId", "client_event_id"),
      "clientEventId",
      128,
    ),
    sequence,
    revision,
    identity: identityFromRow(value),
    actorId: nullableString(
      field(value, "actorId", "actor_id"),
      "actorId",
      128,
    ),
    type,
    payload: parsePayload(type, field(value, "payload", "event_payload")),
    occurredAt: parseIsoTimestamp(
      field(value, "occurredAt", "occurred_at"),
      "occurredAt",
    ),
  } as AnyPersistedMatchEvent;
};

export const parseMatchSnapshot = (
  value: unknown,
): MultiplayerMatchSnapshot => {
  if (!isRecord(value)) {
    throw new MatchContractError("Snapshot multijoueur invalide.");
  }
  const rawPhase = field(value, "phase");
  if (
    typeof rawPhase !== "string" ||
    !SNAPSHOT_PHASES.has(rawPhase as MultiplayerMatchSnapshot["phase"])
  ) {
    throw new MatchContractError("Phase du snapshot invalide.");
  }
  const rawMoves = field(value, "moves");
  if (!Array.isArray(rawMoves) || rawMoves.length > 10_000) {
    throw new MatchContractError("Historique des coups invalide.");
  }
  const sequence = integerField(
    field(value, "sequence"),
    "snapshot.sequence",
    1,
  );
  const revision = integerField(field(value, "revision"), "snapshot.revision");
  if (sequence !== revision + 1) {
    throw new MatchContractError(
      "La séquence du snapshot est incompatible avec sa révision.",
    );
  }
  return {
    identity: identityFromRow(value),
    sequence,
    revision,
    phase: rawPhase as Exclude<MultiplayerPhase, "synchronizing" | "error">,
    currentSide: parseNullableSide(
      field(value, "currentSide", "current_side"),
      "currentSide",
    ),
    moves: rawMoves.map(parseMatchMove),
    clock:
      field(value, "clock") === null || field(value, "clock") === undefined
        ? null
        : parseServerClockAnchor(field(value, "clock")),
    participants: parseParticipants(field(value, "participants")),
    result:
      field(value, "result") === null || field(value, "result") === undefined
        ? null
        : parseResult(field(value, "result")),
    capturedAt: parseIsoTimestamp(
      field(value, "capturedAt", "captured_at"),
      "capturedAt",
    ),
  };
};
