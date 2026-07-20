import type { MatchSide, ServerClockAnchor } from "./contracts";

export interface DerivedClock {
  whiteRemainingMs: number;
  blackRemainingMs: number;
  activeSide: MatchSide | null;
  timedOutSide: MatchSide | null;
  evaluatedAtServerMs: number;
}

const timestampMs = (value: string, label: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} n'est pas un timestamp valide.`);
  }
  return parsed;
};

/**
 * Computes display time from an authoritative server anchor. No interval ever
 * mutates the stored clock; renders can be delayed without accumulating drift.
 */
export const deriveClock = (
  anchor: ServerClockAnchor,
  evaluatedAtServerMs: number,
): DerivedClock => {
  const anchorServerMs = timestampMs(anchor.serverNow, "clock.serverNow");
  const elapsedMs =
    anchor.activeSide === null || anchor.pausedAt !== null
      ? 0
      : Math.max(0, Math.floor(evaluatedAtServerMs - anchorServerMs));

  const whiteRemainingMs = Math.max(
    0,
    anchor.whiteRemainingMs - (anchor.activeSide === "white" ? elapsedMs : 0),
  );
  const blackRemainingMs = Math.max(
    0,
    anchor.blackRemainingMs - (anchor.activeSide === "black" ? elapsedMs : 0),
  );

  const timedOutSide =
    anchor.activeSide === "white" && whiteRemainingMs === 0
      ? "white"
      : anchor.activeSide === "black" && blackRemainingMs === 0
        ? "black"
        : null;

  return {
    whiteRemainingMs,
    blackRemainingMs,
    activeSide: anchor.activeSide,
    timedOutSide,
    evaluatedAtServerMs,
  };
};

export interface ServerTimeObservation {
  clientSentAtMs: number;
  clientReceivedAtMs: number;
  serverNow: string;
}

/** Median-based offset estimation resists a single slow heartbeat response. */
export class ServerTimeEstimator {
  private readonly samples: number[] = [];

  constructor(private readonly maxSamples = 7) {
    if (
      !Number.isSafeInteger(maxSamples) ||
      maxSamples < 1 ||
      maxSamples > 31
    ) {
      throw new Error("maxSamples doit être compris entre 1 et 31.");
    }
  }

  observe(observation: ServerTimeObservation): number {
    const { clientSentAtMs, clientReceivedAtMs } = observation;
    if (
      !Number.isFinite(clientSentAtMs) ||
      !Number.isFinite(clientReceivedAtMs) ||
      clientReceivedAtMs < clientSentAtMs
    ) {
      throw new Error("Échantillon de temps client invalide.");
    }

    const serverNowMs = timestampMs(observation.serverNow, "serverNow");
    const midpoint = clientSentAtMs + (clientReceivedAtMs - clientSentAtMs) / 2;
    const offset = serverNowMs - midpoint;
    this.samples.push(offset);
    if (this.samples.length > this.maxSamples) this.samples.shift();
    return offset;
  }

  get offsetMs(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[middle];
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  estimateServerNow(clientNowMs: number): number {
    if (!Number.isFinite(clientNowMs)) {
      throw new Error("Temps client invalide.");
    }
    return clientNowMs + this.offsetMs;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

export const formatClock = (remainingMs: number): string => {
  const safeMs = Math.max(0, Math.floor(remainingMs));
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
