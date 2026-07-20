import type { ChessSide } from "./clock.ts";
import {
  assertStandardPositionHash,
  standardRulesetHash,
} from "./integrity.ts";
import { MoveProcessingError, type ProcessMoveRequest } from "./protocol.ts";
import {
  inspectStandardPosition,
  STANDARD_PLATFORM_ENGINE_VERSION,
} from "./standard-engine.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{16,128}$/;

type CommandStatus = "pending" | "accepted" | "rejected" | "superseded";

export interface MoveCommandRow {
  id: string;
  matchId: string;
  actorId: string;
  clientCommandId: string;
  expectedRevision: number;
  uci: string;
  status: CommandStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ChessMatchRow {
  id: string;
  status: "pending" | "active" | "completed" | "aborted";
  result: "1-0" | "0-1" | "1/2-1/2" | "*" | null;
  termination: string | null;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  rulesetHash: string;
  engineVersion: string;
  sharedSeed: number;
  currentFen: string;
  sideToMove: ChessSide;
  revision: number;
  clockState: unknown;
  state: Record<string, unknown>;
  ruleStateHash: string;
  positionHash: string;
  startedAt: string | null;
  lastMoveAt: string | null;
  verificationReference: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function safeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function stringOrNull(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" ? value : undefined;
}

export function parseMoveCommandRow(value: unknown): MoveCommandRow {
  if (!isRecord(value)) {
    throw new MoveProcessingError("PROCESSING_FAILED");
  }

  const expectedRevision = safeInteger(value.expected_revision);
  const rejectionReason = stringOrNull(value.rejection_reason);
  const createdAt = stringOrNull(value.created_at);
  const statuses: CommandStatus[] = [
    "pending",
    "accepted",
    "rejected",
    "superseded",
  ];

  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.match_id !== "string" ||
    !UUID_PATTERN.test(value.match_id) ||
    typeof value.actor_id !== "string" ||
    !UUID_PATTERN.test(value.actor_id) ||
    typeof value.client_command_id !== "string" ||
    !UUID_PATTERN.test(value.client_command_id) ||
    expectedRevision === null ||
    expectedRevision < 0 ||
    typeof value.uci !== "string" ||
    typeof value.status !== "string" ||
    !statuses.includes(value.status as CommandStatus) ||
    rejectionReason === undefined ||
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    throw new MoveProcessingError("PROCESSING_FAILED");
  }

  return {
    id: value.id,
    matchId: value.match_id,
    actorId: value.actor_id,
    clientCommandId: value.client_command_id,
    expectedRevision,
    uci: value.uci,
    status: value.status as CommandStatus,
    rejectionReason,
    createdAt,
  };
}

export function parseChessMatchRow(value: unknown): ChessMatchRow {
  if (!isRecord(value)) {
    throw new MoveProcessingError("PROCESSING_FAILED");
  }

  const statuses: ChessMatchRow["status"][] = [
    "pending",
    "active",
    "completed",
    "aborted",
  ];
  const results: NonNullable<ChessMatchRow["result"]>[] = [
    "1-0",
    "0-1",
    "1/2-1/2",
    "*",
  ];
  const revision = safeInteger(value.revision);
  const sharedSeed = safeInteger(value.shared_seed);
  const result = stringOrNull(value.result);
  const termination = stringOrNull(value.termination);
  const whitePlayerId = stringOrNull(value.white_player_id);
  const blackPlayerId = stringOrNull(value.black_player_id);
  const startedAt = stringOrNull(value.started_at);
  const lastMoveAt = stringOrNull(value.last_move_at);
  const verificationReference = stringOrNull(value.verification_reference);

  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.status !== "string" ||
    !statuses.includes(value.status as ChessMatchRow["status"]) ||
    (result !== null &&
      (result === undefined ||
        !results.includes(result as NonNullable<ChessMatchRow["result"]>))) ||
    termination === undefined ||
    (whitePlayerId !== null &&
      (whitePlayerId === undefined || !UUID_PATTERN.test(whitePlayerId))) ||
    (blackPlayerId !== null &&
      (blackPlayerId === undefined || !UUID_PATTERN.test(blackPlayerId))) ||
    typeof value.ruleset_hash !== "string" ||
    !HASH_PATTERN.test(value.ruleset_hash) ||
    typeof value.engine_version !== "string" ||
    sharedSeed === null ||
    sharedSeed < 0 ||
    typeof value.current_fen !== "string" ||
    (value.side_to_move !== "white" && value.side_to_move !== "black") ||
    revision === null ||
    revision < 0 ||
    !isRecord(value.state) ||
    typeof value.rule_state_hash !== "string" ||
    !HASH_PATTERN.test(value.rule_state_hash) ||
    typeof value.position_hash !== "string" ||
    !HASH_PATTERN.test(value.position_hash) ||
    startedAt === undefined ||
    lastMoveAt === undefined ||
    verificationReference === undefined
  ) {
    throw new MoveProcessingError("PROCESSING_FAILED");
  }

  return {
    id: value.id,
    status: value.status as ChessMatchRow["status"],
    result: result as ChessMatchRow["result"],
    termination,
    whitePlayerId,
    blackPlayerId,
    rulesetHash: value.ruleset_hash,
    engineVersion: value.engine_version,
    sharedSeed,
    currentFen: value.current_fen,
    sideToMove: value.side_to_move,
    revision,
    clockState: value.clock_state,
    state: value.state,
    ruleStateHash: value.rule_state_hash,
    positionHash: value.position_hash,
    startedAt,
    lastMoveAt,
    verificationReference,
  };
}

export async function assertStandardMatchPolicy(
  match: ChessMatchRow,
): Promise<void> {
  if (match.state.rulesetType !== "standard") {
    throw new MoveProcessingError("CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE");
  }
  if (
    match.engineVersion !== STANDARD_PLATFORM_ENGINE_VERSION ||
    match.state.engineVersion !== match.engineVersion
  ) {
    throw new MoveProcessingError("UNSUPPORTED_ENGINE_VERSION");
  }
  if (
    match.rulesetHash !== (await standardRulesetHash()) ||
    match.state.rulesetHash !== match.rulesetHash ||
    match.state.ruleStateHash !== match.ruleStateHash
  ) {
    throw new MoveProcessingError("MATCH_STATE_INTEGRITY_FAILED");
  }

  await assertStandardPositionHash(match.currentFen, match.positionHash);

  const position = inspectStandardPosition(match.currentFen);
  if (position.sideToMove !== match.sideToMove) {
    throw new MoveProcessingError("MATCH_STATE_INTEGRITY_FAILED");
  }
}

export function assertCommandMatchesRequest(
  command: MoveCommandRow,
  request: ProcessMoveRequest,
  authenticatedUserId: string,
): void {
  if (
    command.matchId !== request.matchId ||
    command.clientCommandId !== request.clientCommandId ||
    command.expectedRevision !== request.expectedRevision ||
    command.uci !== request.uci
  ) {
    throw new MoveProcessingError("MATCH_STATE_INTEGRITY_FAILED");
  }
  if (command.actorId !== authenticatedUserId) {
    throw new MoveProcessingError("COMMAND_ACTOR_MISMATCH");
  }
}

export function assertActiveTurn(
  match: ChessMatchRow,
  command: MoveCommandRow,
): void {
  if (match.status !== "active") {
    throw new MoveProcessingError("MATCH_NOT_ACTIVE");
  }
  if (match.revision !== command.expectedRevision) {
    throw new MoveProcessingError("STALE_MATCH_REVISION");
  }

  const expectedActor =
    match.sideToMove === "white" ? match.whitePlayerId : match.blackPlayerId;
  if (!expectedActor || expectedActor !== command.actorId) {
    throw new MoveProcessingError("NOT_YOUR_TURN");
  }
}
