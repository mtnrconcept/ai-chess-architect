import type { MatchParticipant, RealtimeConnectionStatus } from "./contracts";

export type ParticipantPresenceState =
  | "unknown"
  | "connected"
  | "reconnecting"
  | "abandonment_candidate";

export interface ParticipantPresenceAssessment {
  userId: string;
  state: ParticipantPresenceState;
  lastSeenAt: string | null;
  staleForMs: number | null;
}

export interface PresenceThresholds {
  disconnectAfterMs: number;
  abandonmentAfterMs: number;
}

const DEFAULT_THRESHOLDS: PresenceThresholds = {
  disconnectAfterMs: 12_000,
  abandonmentAfterMs: 60_000,
};

/**
 * Client-side lease assessment only. `abandonment_candidate` must be submitted
 * to the server; the browser is never authoritative for a match result.
 */
export class PresenceLeaseTracker {
  private readonly lastSeen = new Map<string, number>();
  private localConnection: RealtimeConnectionStatus = "idle";
  readonly thresholds: PresenceThresholds;

  constructor(thresholds: Partial<PresenceThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    if (
      this.thresholds.disconnectAfterMs < 1_000 ||
      this.thresholds.abandonmentAfterMs <= this.thresholds.disconnectAfterMs
    ) {
      throw new Error("Les seuils de présence sont invalides.");
    }
  }

  setLocalConnection(status: RealtimeConnectionStatus): void {
    this.localConnection = status;
  }

  observe(userId: string, serverObservedAt: string): void {
    const timestamp = Date.parse(serverObservedAt);
    if (!Number.isFinite(timestamp)) {
      throw new Error("Timestamp de présence invalide.");
    }
    const previous = this.lastSeen.get(userId) ?? Number.NEGATIVE_INFINITY;
    this.lastSeen.set(userId, Math.max(previous, timestamp));
  }

  seed(participants: readonly MatchParticipant[]): void {
    for (const participant of participants) {
      if (participant.lastSeenAt) {
        this.observe(participant.userId, participant.lastSeenAt);
      }
    }
  }

  assess(
    userId: string,
    evaluatedAtServerMs: number,
  ): ParticipantPresenceAssessment {
    const lastSeenMs = this.lastSeen.get(userId);
    if (lastSeenMs === undefined) {
      return {
        userId,
        state: "unknown",
        lastSeenAt: null,
        staleForMs: null,
      };
    }

    const staleForMs = Math.max(0, evaluatedAtServerMs - lastSeenMs);
    const state: ParticipantPresenceState =
      staleForMs >= this.thresholds.abandonmentAfterMs
        ? "abandonment_candidate"
        : staleForMs >= this.thresholds.disconnectAfterMs
          ? "reconnecting"
          : "connected";

    return {
      userId,
      state,
      lastSeenAt: new Date(lastSeenMs).toISOString(),
      staleForMs,
    };
  }

  get isLocalOffline(): boolean {
    return this.localConnection === "offline";
  }
}
