const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export const MAX_REQUEST_BYTES = 4_096;

export type MoveErrorCode =
  | "AUTH_REQUIRED"
  | "COMMAND_ACTOR_MISMATCH"
  | "COMMAND_NOT_PENDING"
  | "COMMAND_RATE_LIMITED"
  | "COMMAND_SUBMISSION_REJECTED"
  | "CLOCK_EXPIRED"
  | "CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE"
  | "ILLEGAL_MOVE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INVALID_AUTHORITATIVE_POSITION"
  | "INVALID_CLOCK_STATE"
  | "INVALID_REQUEST"
  | "MATCH_NOT_ACTIVE"
  | "MATCH_STATE_INTEGRITY_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "MOVE_ALREADY_PENDING"
  | "NOT_YOUR_TURN"
  | "PROCESSING_FAILED"
  | "STALE_MATCH_REVISION"
  | "UNSUPPORTED_ENGINE_VERSION";

export class MoveProcessingError extends Error {
  readonly code: MoveErrorCode;

  constructor(code: MoveErrorCode) {
    super(code);
    this.name = "MoveProcessingError";
    this.code = code;
  }
}

export interface ProcessMoveRequest {
  matchId: string;
  expectedRevision: number;
  clientCommandId: string;
  uci: string;
}

export interface ParsedUci {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseProcessMoveRequest(value: unknown): ProcessMoveRequest {
  if (!isRecord(value)) {
    throw new MoveProcessingError("INVALID_REQUEST");
  }

  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "clientCommandId",
    "expectedRevision",
    "matchId",
    "uci",
  ];

  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new MoveProcessingError("INVALID_REQUEST");
  }

  const matchId = value.matchId;
  const expectedRevision = value.expectedRevision;
  const clientCommandId = value.clientCommandId;
  const uci = value.uci;

  if (
    typeof matchId !== "string" ||
    !UUID_PATTERN.test(matchId) ||
    typeof clientCommandId !== "string" ||
    !UUID_PATTERN.test(clientCommandId) ||
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    typeof uci !== "string" ||
    !UCI_PATTERN.test(uci)
  ) {
    throw new MoveProcessingError("INVALID_REQUEST");
  }

  return {
    matchId: matchId.toLowerCase(),
    expectedRevision,
    clientCommandId: clientCommandId.toLowerCase(),
    uci,
  };
}

export function parseUci(uci: string): ParsedUci {
  if (!UCI_PATTERN.test(uci)) {
    throw new MoveProcessingError("INVALID_REQUEST");
  }

  const promotion =
    uci.length === 5 ? (uci[4] as ParsedUci["promotion"]) : undefined;

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(promotion ? { promotion } : {}),
  };
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new MoveProcessingError("INVALID_REQUEST");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maximumBytes
    ) {
      throw new MoveProcessingError("INVALID_REQUEST");
    }
  }

  if (!request.body) {
    throw new MoveProcessingError("INVALID_REQUEST");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel("request body too large");
        throw new MoveProcessingError("INVALID_REQUEST");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(combined),
    );
  } catch {
    throw new MoveProcessingError("INVALID_REQUEST");
  }
}
