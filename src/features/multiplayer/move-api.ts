const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export type ProcessMoveErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "COMMAND_SUBMISSION_REJECTED"
  | "STALE_MATCH_REVISION"
  | "ILLEGAL_MOVE"
  | "CLOCK_EXPIRED"
  | "CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE"
  | "MATCH_STATE_INTEGRITY_FAILED"
  | "PROCESSING_FAILED"
  | string;

export interface ProcessChessMoveRequest {
  matchId: string;
  expectedRevision: number;
  clientCommandId: string;
  uci: string;
}

export interface ProcessChessMoveResult {
  commandId: string;
  commandStatus: "accepted";
  matchId: string;
  revision: number;
  alreadyProcessed: boolean;
}

interface FunctionInvokeResult {
  data: unknown;
  error: unknown;
}

export interface ProcessMoveFunctionsClient {
  functions: {
    invoke(
      functionName: string,
      options: { body: ProcessChessMoveRequest },
    ): Promise<FunctionInvokeResult>;
  };
}

interface ErrorEnvelope {
  code: ProcessMoveErrorCode;
  message: string;
}

export class ProcessChessMoveError extends Error {
  readonly code: ProcessMoveErrorCode;
  readonly status: number | null;

  constructor(
    code: ProcessMoveErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "ProcessChessMoveError";
    this.code = code;
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseErrorEnvelope = (value: unknown): ErrorEnvelope | null => {
  if (!isRecord(value) || value.success !== false || !isRecord(value.error)) {
    return null;
  }
  if (
    typeof value.error.code !== "string" ||
    typeof value.error.message !== "string"
  ) {
    return null;
  }
  return {
    code: value.error.code,
    message: value.error.message,
  };
};

const readHttpError = async (
  error: unknown,
): Promise<{ envelope: ErrorEnvelope | null; status: number | null }> => {
  if (!isRecord(error) || !isRecord(error.context)) {
    return { envelope: null, status: null };
  }

  const status =
    typeof error.context.status === "number" ? error.context.status : null;
  const clone = error.context.clone;
  if (typeof clone !== "function") {
    return { envelope: null, status };
  }

  try {
    const response = clone.call(error.context) as {
      json?: () => Promise<unknown>;
    };
    const payload = await response.json?.();
    return { envelope: parseErrorEnvelope(payload), status };
  } catch {
    return { envelope: null, status };
  }
};

const assertRequest = (request: ProcessChessMoveRequest): void => {
  if (
    !UUID_PATTERN.test(request.matchId) ||
    !UUID_PATTERN.test(request.clientCommandId) ||
    !Number.isSafeInteger(request.expectedRevision) ||
    request.expectedRevision < 0 ||
    !UCI_PATTERN.test(request.uci)
  ) {
    throw new ProcessChessMoveError(
      "INVALID_REQUEST",
      "La commande de coup est invalide.",
      400,
    );
  }
};

const parseSuccess = (
  value: unknown,
  expectedMatchId: string,
): ProcessChessMoveResult | null => {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    return null;
  }
  const data = value.data;
  if (
    typeof data.commandId !== "string" ||
    !UUID_PATTERN.test(data.commandId) ||
    data.commandStatus !== "accepted" ||
    typeof data.matchId !== "string" ||
    data.matchId.toLowerCase() !== expectedMatchId.toLowerCase() ||
    !Number.isSafeInteger(data.revision) ||
    (data.revision as number) < 0 ||
    typeof data.alreadyProcessed !== "boolean"
  ) {
    return null;
  }

  return {
    commandId: data.commandId,
    commandStatus: "accepted",
    matchId: data.matchId.toLowerCase(),
    revision: data.revision as number,
    alreadyProcessed: data.alreadyProcessed,
  };
};

export const processChessMove = async (
  client: ProcessMoveFunctionsClient,
  request: ProcessChessMoveRequest,
): Promise<ProcessChessMoveResult> => {
  assertRequest(request);
  const { data, error } = await client.functions.invoke("process-chess-move", {
    body: request,
  });

  const responseError = parseErrorEnvelope(data);
  if (responseError) {
    throw new ProcessChessMoveError(responseError.code, responseError.message);
  }

  if (error) {
    const httpError = await readHttpError(error);
    if (httpError.envelope) {
      throw new ProcessChessMoveError(
        httpError.envelope.code,
        httpError.envelope.message,
        httpError.status,
      );
    }
    const message =
      isRecord(error) && typeof error.message === "string"
        ? error.message
        : "Le validateur de coups est temporairement indisponible.";
    throw new ProcessChessMoveError(
      "PROCESSING_FAILED",
      message,
      httpError.status,
    );
  }

  const success = parseSuccess(data, request.matchId);
  if (!success) {
    throw new ProcessChessMoveError(
      "MATCH_STATE_INTEGRITY_FAILED",
      "La réponse du validateur ne correspond pas au match demandé.",
      500,
    );
  }
  return success;
};

export const isStrictMatchUuid = (value: string | undefined): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);
