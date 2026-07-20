import { MoveProcessingError } from "./protocol.ts";

export type ChessSide = "white" | "black";

export interface AuthoritativeClockState {
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
}

export interface ClockTransition {
  expired: boolean;
  spentMs: number;
  remainingBeforeIncrementMs: number;
  state: AuthoritativeClockState;
}

const MAX_CLOCK_VALUE_MS = 100_000_000_000;
const MAX_RECORDED_MOVE_DURATION_MS = 604_800_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60_000;

function readClockInteger(
  value: Record<string, unknown>,
  key: keyof AuthoritativeClockState,
): number {
  const candidate = value[key];
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < 0 ||
    candidate > MAX_CLOCK_VALUE_MS
  ) {
    throw new MoveProcessingError("INVALID_CLOCK_STATE");
  }
  return candidate;
}

export function parseClockState(value: unknown): AuthoritativeClockState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MoveProcessingError("INVALID_CLOCK_STATE");
  }

  const record = value as Record<string, unknown>;
  return {
    whiteMs: readClockInteger(record, "whiteMs"),
    blackMs: readClockInteger(record, "blackMs"),
    incrementMs: readClockInteger(record, "incrementMs"),
  };
}

export function computeAuthoritativeClock(
  value: unknown,
  side: ChessSide,
  turnStartedAt: string | null,
  nowMs: number,
): ClockTransition {
  const state = parseClockState(value);
  const turnStartedMs =
    typeof turnStartedAt === "string" ? Date.parse(turnStartedAt) : Number.NaN;

  if (
    !Number.isFinite(turnStartedMs) ||
    !Number.isSafeInteger(nowMs) ||
    turnStartedMs - nowMs > MAX_FUTURE_CLOCK_SKEW_MS
  ) {
    throw new MoveProcessingError("INVALID_CLOCK_STATE");
  }

  const spentMs = Math.max(0, Math.floor(nowMs - turnStartedMs));
  const currentMs = side === "white" ? state.whiteMs : state.blackMs;
  const remainingMs = currentMs - spentMs;

  if (remainingMs <= 0) {
    return {
      expired: true,
      spentMs: Math.min(spentMs, MAX_RECORDED_MOVE_DURATION_MS),
      remainingBeforeIncrementMs: 0,
      state: {
        ...state,
        ...(side === "white" ? { whiteMs: 0 } : { blackMs: 0 }),
      },
    };
  }

  if (spentMs > MAX_RECORDED_MOVE_DURATION_MS) {
    throw new MoveProcessingError("INVALID_CLOCK_STATE");
  }

  const afterIncrementMs = remainingMs + state.incrementMs;
  if (
    !Number.isSafeInteger(afterIncrementMs) ||
    afterIncrementMs > MAX_CLOCK_VALUE_MS
  ) {
    throw new MoveProcessingError("INVALID_CLOCK_STATE");
  }

  return {
    expired: false,
    spentMs,
    remainingBeforeIncrementMs: remainingMs,
    state: {
      ...state,
      ...(side === "white"
        ? { whiteMs: afterIncrementMs }
        : { blackMs: afterIncrementMs }),
    },
  };
}
