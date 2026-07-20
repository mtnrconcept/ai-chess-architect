import {
  type AuthenticatedClients,
  authenticateRequest,
} from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";
import { computeAuthoritativeClock } from "./clock.ts";
import {
  createRuleStateHash,
  createTimeoutVerificationReference,
  createVerificationReference,
} from "./integrity.ts";
import {
  assertActiveTurn,
  assertCommandMatchesRequest,
  assertStandardMatchPolicy,
  type ChessMatchRow,
  type MoveCommandRow,
  parseChessMatchRow,
  parseMoveCommandRow,
} from "./match-policy.ts";
import {
  type MoveErrorCode,
  MoveProcessingError,
  parseProcessMoveRequest,
  type ProcessMoveRequest,
  readBoundedJson,
} from "./protocol.ts";
import {
  STANDARD_VALIDATOR_ID,
  validateStandardMove,
} from "./standard-engine.ts";

type ServiceClient = AuthenticatedClients["serviceClient"];

const COMMAND_SELECT = [
  "id",
  "match_id",
  "actor_id",
  "client_command_id",
  "expected_revision",
  "uci",
  "status",
  "rejection_reason",
  "created_at",
].join(",");

const MATCH_SELECT = [
  "id",
  "status",
  "result",
  "termination",
  "white_player_id",
  "black_player_id",
  "ruleset_hash",
  "engine_version",
  "shared_seed",
  "current_fen",
  "side_to_move",
  "revision",
  "clock_state",
  "state",
  "rule_state_hash",
  "position_hash",
  "started_at",
  "last_move_at",
  "verification_reference",
].join(",");

const ERROR_MESSAGES: Record<MoveErrorCode, string> = {
  AUTH_REQUIRED: "Authentification requise.",
  CLOCK_EXPIRED: "Le temps de réflexion est écoulé.",
  COMMAND_ACTOR_MISMATCH:
    "Cette commande n'appartient pas au joueur authentifié.",
  COMMAND_NOT_PENDING: "Cette commande a déjà été traitée.",
  COMMAND_RATE_LIMITED: "Trop de coups ont été refusés pour cette position.",
  COMMAND_SUBMISSION_REJECTED: "La commande de coup a été refusée.",
  CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE:
    "Le validateur serveur des règles personnalisées n'est pas encore disponible.",
  ILLEGAL_MOVE: "Ce coup n'est pas légal dans la position courante.",
  IDEMPOTENCY_KEY_REUSED:
    "Cette clé de commande a déjà servi avec un autre contenu.",
  INVALID_AUTHORITATIVE_POSITION:
    "La position serveur ne peut pas être validée.",
  INVALID_CLOCK_STATE: "L'horloge serveur est invalide.",
  INVALID_REQUEST: "La requête de coup est invalide.",
  MATCH_NOT_ACTIVE: "La partie n'est plus active.",
  MATCH_STATE_INTEGRITY_FAILED:
    "L'intégrité de la partie n'a pas pu être vérifiée.",
  METHOD_NOT_ALLOWED: "Méthode non autorisée.",
  MOVE_ALREADY_PENDING: "Un coup est déjà en attente pour cette position.",
  NOT_YOUR_TURN: "Ce n'est pas au joueur authentifié de jouer.",
  PROCESSING_FAILED: "Le coup n'a pas pu être traité de façon sûre.",
  STALE_MATCH_REVISION: "La position a changé; recharge la partie.",
  UNSUPPORTED_ENGINE_VERSION:
    "La version du moteur de cette partie n'est pas prise en charge.",
};

function errorStatus(code: MoveErrorCode): number {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "COMMAND_ACTOR_MISMATCH":
    case "NOT_YOUR_TURN":
      return 403;
    case "INVALID_REQUEST":
      return 400;
    case "COMMAND_RATE_LIMITED":
      return 429;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE":
    case "ILLEGAL_MOVE":
      return 422;
    case "INVALID_AUTHORITATIVE_POSITION":
    case "INVALID_CLOCK_STATE":
    case "MATCH_STATE_INTEGRITY_FAILED":
    case "PROCESSING_FAILED":
    case "UNSUPPORTED_ENGINE_VERSION":
      return 503;
    default:
      return 409;
  }
}

function isMoveErrorCode(value: string | null): value is MoveErrorCode {
  return value !== null && Object.hasOwn(ERROR_MESSAGES, value);
}

function errorResponse(
  request: Request,
  code: MoveErrorCode,
  data?: Record<string, unknown>,
): Response {
  return jsonResponse(request, errorStatus(code), {
    success: false,
    error: { code, message: ERROR_MESSAGES[code] },
    ...(data ? { data } : {}),
  });
}

function firstRpcRow(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
}

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

function databaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

function databaseErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : "";
}

async function loadCommand(
  serviceClient: ServiceClient,
  commandId: string,
  matchId: string,
): Promise<MoveCommandRow> {
  const { data, error } = await serviceClient
    .from("chess_move_commands")
    .select(COMMAND_SELECT)
    .eq("id", commandId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (error || !data) {
    console.error("[process-chess-move]", {
      operation: "load_command",
      databaseCode: databaseErrorCode(error),
    });
    throw new MoveProcessingError("PROCESSING_FAILED");
  }
  return parseMoveCommandRow(data);
}

async function loadMatch(
  serviceClient: ServiceClient,
  matchId: string,
): Promise<ChessMatchRow> {
  const { data, error } = await serviceClient
    .from("chess_matches")
    .select(MATCH_SELECT)
    .eq("id", matchId)
    .maybeSingle();

  if (error || !data) {
    console.error("[process-chess-move]", {
      operation: "load_match",
      databaseCode: databaseErrorCode(error),
    });
    throw new MoveProcessingError("PROCESSING_FAILED");
  }
  return parseChessMatchRow(data);
}

async function rejectPendingCommand(
  serviceClient: ServiceClient,
  commandId: string,
  reason: MoveErrorCode,
): Promise<void> {
  const { data, error } = await serviceClient.rpc(
    "reject_chess_move_command_server",
    { p_command_id: commandId, p_reason: reason },
  );

  if (error || data !== true) {
    console.error("[process-chess-move]", {
      operation: "reject_command",
      databaseCode: databaseErrorCode(error),
    });
    throw new MoveProcessingError("COMMAND_NOT_PENDING");
  }
}

async function rejectAndRethrow(
  serviceClient: ServiceClient,
  command: MoveCommandRow,
  error: unknown,
): Promise<never> {
  if (error instanceof MoveProcessingError) {
    await rejectPendingCommand(serviceClient, command.id, error.code);
    throw error;
  }
  throw error;
}

type TimeoutTerminal =
  | { result: "1-0" | "0-1"; termination: "timeout" }
  | {
      result: "1/2-1/2";
      termination: "timeout-insufficient-material";
    };

async function finalizeTimeout(
  serviceClient: ServiceClient,
  match: ChessMatchRow,
  expectedRevision: number,
): Promise<TimeoutTerminal> {
  // PostgreSQL derives the claimant's mating material from the authoritative
  // FEN. The Edge worker signs only the timeout evidence and never guesses the
  // result, because insufficient material changes the verdict to a draw.
  const verificationReference = await createTimeoutVerificationReference({
    matchId: match.id,
    revision: expectedRevision,
    fen: match.currentFen,
    rulesetHash: match.rulesetHash,
  });
  const { data, error } = await serviceClient.rpc(
    "finalize_chess_timeout_server",
    {
      p_match_id: match.id,
      p_expected_revision: expectedRevision,
      p_verification_reference: verificationReference,
    },
  );

  const row = firstRpcRow(data);
  const result = row?.result;
  const termination = row?.termination;
  const isWinningTimeout =
    (result === "1-0" || result === "0-1") && termination === "timeout";
  const isInsufficientMaterialDraw =
    result === "1/2-1/2" && termination === "timeout-insufficient-material";
  if (error || !row || (!isWinningTimeout && !isInsufficientMaterialDraw)) {
    console.error("[process-chess-move]", {
      operation: "finalize_timeout",
      databaseCode: databaseErrorCode(error),
    });
    throw new MoveProcessingError("STALE_MATCH_REVISION");
  }
  return { result, termination } as TimeoutTerminal;
}

async function handleSubmissionTimeout(
  request: Request,
  serviceClient: ServiceClient,
  input: ProcessMoveRequest,
  authenticatedUserId: string,
): Promise<Response> {
  const match = await loadMatch(serviceClient, input.matchId);
  await assertStandardMatchPolicy(match);

  if (match.status !== "active" || match.revision !== input.expectedRevision) {
    throw new MoveProcessingError("STALE_MATCH_REVISION");
  }
  const expectedActor =
    match.sideToMove === "white" ? match.whitePlayerId : match.blackPlayerId;
  if (!expectedActor || expectedActor !== authenticatedUserId) {
    throw new MoveProcessingError("NOT_YOUR_TURN");
  }

  const terminal = await finalizeTimeout(
    serviceClient,
    match,
    input.expectedRevision,
  );
  return errorResponse(request, "CLOCK_EXPIRED", {
    matchId: match.id,
    revision: input.expectedRevision + 1,
    terminal,
  });
}

async function processPendingCommand(
  request: Request,
  serviceClient: ServiceClient,
  command: MoveCommandRow,
  match: ChessMatchRow,
): Promise<Response> {
  try {
    await assertStandardMatchPolicy(match);
    assertActiveTurn(match, command);
  } catch (error) {
    return await rejectAndRethrow(serviceClient, command, error);
  }

  const clock = (() => {
    try {
      return computeAuthoritativeClock(
        match.clockState,
        match.sideToMove,
        match.lastMoveAt ?? match.startedAt,
        Date.parse(command.createdAt),
      );
    } catch (error) {
      return rejectAndRethrow(serviceClient, command, error);
    }
  })();
  const resolvedClock = await clock;

  if (resolvedClock.expired) {
    const terminal = await finalizeTimeout(
      serviceClient,
      match,
      command.expectedRevision,
    );
    return errorResponse(request, "CLOCK_EXPIRED", {
      commandId: command.id,
      matchId: match.id,
      revision: command.expectedRevision + 1,
      terminal,
    });
  }

  let move;
  try {
    move = validateStandardMove(match.currentFen, command.uci);
    if (move.nextSide === match.sideToMove) {
      throw new MoveProcessingError("MATCH_STATE_INTEGRITY_FAILED");
    }
  } catch (error) {
    return await rejectAndRethrow(serviceClient, command, error);
  }

  const moveRevision = command.expectedRevision + 1;
  const ruleStateHash = await createRuleStateHash({
    rulesetHash: match.rulesetHash,
    sharedSeed: match.sharedSeed,
    revision: moveRevision,
    fen: move.fenAfter,
  });
  const verificationReference = move.terminal
    ? await createVerificationReference({
        matchId: match.id,
        revision: moveRevision,
        fen: move.fenAfter,
        result: move.terminal.result,
        termination: move.terminal.termination,
        rulesetHash: match.rulesetHash,
      })
    : null;
  const { data: committedData, error: commitError } = await serviceClient.rpc(
    "commit_and_finalize_chess_move_server",
    {
      p_command_id: command.id,
      p_san: move.san,
      p_fen_before: move.fenBefore,
      p_fen_after: move.fenAfter,
      p_clock_state: resolvedClock.state,
      p_next_side: move.nextSide,
      p_rule_state_hash: ruleStateHash,
      p_spent_ms: resolvedClock.spentMs,
      p_event_payload: {
        validator: {
          kind: "standard",
          implementation: STANDARD_VALIDATOR_ID,
          policy: "standard-validator-v1",
        },
        isCheck: move.isCheck,
        terminal: move.terminal,
      },
      p_terminal_result: move.terminal?.result ?? null,
      p_terminal_termination: move.terminal?.termination ?? null,
      p_verification_reference: verificationReference,
    },
  );
  const committed = firstRpcRow(committedData);
  const committedRevision = safeInteger(committed?.move_revision);
  const authoritativeRevision = safeInteger(committed?.authoritative_revision);

  if (
    commitError ||
    !committed ||
    committedRevision !== moveRevision ||
    authoritativeRevision !== moveRevision + (move.terminal ? 1 : 0)
  ) {
    console.error("[process-chess-move]", {
      operation: "commit_move",
      databaseCode: databaseErrorCode(commitError),
    });
    throw new MoveProcessingError("STALE_MATCH_REVISION");
  }

  return jsonResponse(request, 200, {
    success: true,
    data: {
      commandId: command.id,
      commandStatus: "accepted",
      matchId: match.id,
      revision: authoritativeRevision,
      move: {
        revision: moveRevision,
        uci: move.uci,
        san: move.san,
        fenAfter: move.fenAfter,
        nextSide: move.nextSide,
        clockState: resolvedClock.state,
      },
      terminal: move.terminal,
      alreadyProcessed: false,
    },
  });
}

export interface ProcessChessMoveDependencies {
  authenticateRequest: typeof authenticateRequest;
}

export type ProcessChessMoveHandler = (request: Request) => Promise<Response>;

export function createProcessChessMoveHandler(
  dependencies: Partial<ProcessChessMoveDependencies> = {},
): ProcessChessMoveHandler {
  const authenticate = dependencies.authenticateRequest ?? authenticateRequest;

  return async (request: Request): Promise<Response> => {
    const preflight = handlePreflight(request);
    if (preflight) {
      return preflight;
    }
    if (request.method !== "POST") {
      return errorResponse(request, "METHOD_NOT_ALLOWED");
    }

    let input: ProcessMoveRequest;
    try {
      input = parseProcessMoveRequest(await readBoundedJson(request));
    } catch {
      return errorResponse(request, "INVALID_REQUEST");
    }

    try {
      const { user, userClient, serviceClient } = await authenticate(request);
      const { data: submissionData, error: submissionError } =
        await userClient.rpc("submit_chess_move_command", {
          p_match_id: input.matchId,
          p_expected_revision: input.expectedRevision,
          p_client_command_id: input.clientCommandId,
          p_uci: input.uci,
          p_submitted_clock_ms: null,
        });

      if (submissionError) {
        const message = databaseErrorMessage(submissionError);
        if (message.includes("CLOCK_EXPIRED")) {
          return await handleSubmissionTimeout(
            request,
            serviceClient,
            input,
            user.id,
          );
        }
        if (message.includes("MOVE_ALREADY_PENDING")) {
          throw new MoveProcessingError("MOVE_ALREADY_PENDING");
        }
        if (message.includes("STALE_MATCH_REVISION")) {
          throw new MoveProcessingError("STALE_MATCH_REVISION");
        }
        if (message.includes("NOT_YOUR_TURN")) {
          throw new MoveProcessingError("NOT_YOUR_TURN");
        }
        if (message.includes("MATCH_NOT_ACTIVE")) {
          throw new MoveProcessingError("MATCH_NOT_ACTIVE");
        }
        if (message.includes("IDEMPOTENCY_KEY_REUSED")) {
          throw new MoveProcessingError("IDEMPOTENCY_KEY_REUSED");
        }
        if (message.includes("COMMAND_RATE_LIMITED")) {
          throw new MoveProcessingError("COMMAND_RATE_LIMITED");
        }

        console.error("[process-chess-move]", {
          operation: "submit_command",
          databaseCode: databaseErrorCode(submissionError),
        });
        throw new MoveProcessingError("COMMAND_SUBMISSION_REJECTED");
      }

      const submission = firstRpcRow(submissionData);
      if (typeof submission?.command_id !== "string") {
        throw new MoveProcessingError("PROCESSING_FAILED");
      }

      // Service-role reads are scoped to the exact command and its exact parent
      // match; arbitrary client-provided filters are never forwarded.
      const command = await loadCommand(
        serviceClient,
        submission.command_id,
        input.matchId,
      );
      const match = await loadMatch(serviceClient, command.matchId);
      try {
        assertCommandMatchesRequest(command, input, user.id);
      } catch (error) {
        if (command.status === "pending") {
          return await rejectAndRethrow(serviceClient, command, error);
        }
        throw error;
      }

      if (command.status === "accepted") {
        return jsonResponse(request, 200, {
          success: true,
          data: {
            commandId: command.id,
            commandStatus: "accepted",
            matchId: match.id,
            revision: match.revision,
            terminal:
              match.status === "completed"
                ? { result: match.result, termination: match.termination }
                : null,
            alreadyProcessed: true,
          },
        });
      }
      if (
        command.status === "rejected" &&
        isMoveErrorCode(command.rejectionReason)
      ) {
        throw new MoveProcessingError(command.rejectionReason);
      }
      if (command.status !== "pending") {
        throw new MoveProcessingError("COMMAND_NOT_PENDING");
      }

      return await processPendingCommand(
        request,
        serviceClient,
        command,
        match,
      );
    } catch (error) {
      const authCode = error instanceof Error ? error.message : "";
      if (authCode === "AUTH_REQUIRED" || authCode === "AUTH_INVALID") {
        return errorResponse(request, "AUTH_REQUIRED");
      }
      if (error instanceof MoveProcessingError) {
        return errorResponse(request, error.code);
      }

      console.error("[process-chess-move]", { operation: "unhandled" });
      return errorResponse(request, "PROCESSING_FAILED");
    }
  };
}

export const handleRequest = createProcessChessMoveHandler();

if (import.meta.main) {
  Deno.serve(handleRequest);
}
