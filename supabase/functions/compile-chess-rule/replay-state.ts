export const DEFAULT_STALE_PROCESSING_SECONDS = 180;
export const MIN_STALE_PROCESSING_SECONDS = 180;
export const MAX_STALE_PROCESSING_SECONDS = 900;

export const STALE_PROCESSING_FAILURE_CODE =
  "STALE_PROCESSING_RESERVATION" as const;

export type CompilationStatus =
  | "processing"
  | "validated"
  | "rejected"
  | "published"
  | "failed";

export interface CompilationReplayState {
  status: CompilationStatus;
  updated_at: string;
  expires_at: string;
  metrics: Record<string, unknown> | null;
}

export type RequestEnvelopeReplayMatch =
  | "verified-match"
  | "verified-conflict"
  | "legacy-unverified";

/**
 * A terminal replay must be identifiable before re-verifying a now-expired
 * one-hour guidance token. Rows created before this fingerprint existed retain
 * the historical verified prompt-hash path instead of being downgraded.
 */
export function classifyRequestEnvelopeReplay(
  metrics: Record<string, unknown> | null,
  requestEnvelopeFingerprint: string,
  premiumRequested: boolean,
): RequestEnvelopeReplayMatch {
  const storedFingerprint = metrics?.requestEnvelopeFingerprint;
  if (typeof storedFingerprint !== "string") return "legacy-unverified";
  return storedFingerprint === requestEnvelopeFingerprint &&
    metrics?.premiumRequested === premiumRequested
    ? "verified-match"
    : "verified-conflict";
}

export type CompilationReplayDisposition =
  | {
      kind: "processing-active";
      code: "COMPILATION_IN_PROGRESS";
      httpStatus: 409;
      retryable: true;
      newRequestRequired: false;
    }
  | {
      kind: "processing-stale";
      code: typeof STALE_PROCESSING_FAILURE_CODE;
      httpStatus: 410;
      retryable: false;
      newRequestRequired: true;
    }
  | {
      kind: "failed";
      code:
        | typeof STALE_PROCESSING_FAILURE_CODE
        | "QUOTA_EXCEEDED"
        | "COMPILATION_FAILED";
      httpStatus: 410 | 429 | 500;
      retryable: false;
      newRequestRequired: true;
    }
  | {
      kind: "expired";
      code: "COMPILATION_EXPIRED";
      httpStatus: 410;
      retryable: false;
      newRequestRequired: true;
    }
  | {
      kind: "terminal-success";
      code: "COMPILATION_REPLAYED";
      httpStatus: 200;
      retryable: false;
      newRequestRequired: false;
    };

export function parseStaleProcessingSeconds(raw: string | undefined): number {
  if (!raw?.trim()) {
    return DEFAULT_STALE_PROCESSING_SECONDS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STALE_PROCESSING_SECONDS;
  }

  return Math.min(
    MAX_STALE_PROCESSING_SECONDS,
    Math.max(MIN_STALE_PROCESSING_SECONDS, Math.floor(parsed)),
  );
}

const timestampMilliseconds = (value: string): number | null => {
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
};

export function classifyCompilationReplay(
  row: CompilationReplayState,
  staleAfterSeconds: number,
  nowMilliseconds = Date.now(),
): CompilationReplayDisposition {
  if (row.status === "processing") {
    const updatedAt = timestampMilliseconds(row.updated_at);
    const staleAfterMilliseconds = staleAfterSeconds * 1000;
    const stale =
      updatedAt === null ||
      nowMilliseconds - updatedAt >= staleAfterMilliseconds;

    return stale
      ? {
          kind: "processing-stale",
          code: STALE_PROCESSING_FAILURE_CODE,
          httpStatus: 410,
          retryable: false,
          newRequestRequired: true,
        }
      : {
          kind: "processing-active",
          code: "COMPILATION_IN_PROGRESS",
          httpStatus: 409,
          retryable: true,
          newRequestRequired: false,
        };
  }

  const expiresAt = timestampMilliseconds(row.expires_at);
  if (expiresAt === null || expiresAt <= nowMilliseconds) {
    return {
      kind: "expired",
      code: "COMPILATION_EXPIRED",
      httpStatus: 410,
      retryable: false,
      newRequestRequired: true,
    };
  }

  if (row.status === "failed") {
    const storedFailureCode = row.metrics?.failureCode;
    const code =
      storedFailureCode === STALE_PROCESSING_FAILURE_CODE
        ? STALE_PROCESSING_FAILURE_CODE
        : storedFailureCode === "QUOTA_EXCEEDED"
          ? "QUOTA_EXCEEDED"
          : "COMPILATION_FAILED";
    const httpStatus =
      code === STALE_PROCESSING_FAILURE_CODE
        ? 410
        : code === "QUOTA_EXCEEDED"
          ? 429
          : 500;

    return {
      kind: "failed",
      code,
      httpStatus,
      retryable: false,
      newRequestRequired: true,
    };
  }

  return {
    kind: "terminal-success",
    code: "COMPILATION_REPLAYED",
    httpStatus: 200,
    retryable: false,
    newRequestRequired: false,
  };
}
