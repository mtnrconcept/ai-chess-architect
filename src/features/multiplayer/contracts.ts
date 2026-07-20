export type MatchSide = "white" | "black";

export type MultiplayerPhase =
  | "synchronizing"
  | "waiting"
  | "playing"
  | "paused"
  | "finished"
  | "abandoned"
  | "error";

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "closed"
  | "error";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export interface MatchIdentityInput {
  matchId: string;
  lobbyId: string;
  rulesetHash: string;
  matchSeed: string | number | bigint;
  engineVersion: string;
}

/**
 * Identity shared by both players. The seed is kept as a canonical decimal
 * string so a Postgres bigint is never rounded by JavaScript.
 */
export interface MatchIdentity {
  matchId: string;
  lobbyId: string;
  rulesetHash: string;
  matchSeed: string;
  engineVersion: string;
}

export interface ServerClockAnchor {
  /** Remaining values are authoritative at `serverNow`. */
  whiteRemainingMs: number;
  blackRemainingMs: number;
  activeSide: MatchSide | null;
  turnStartedAt: string | null;
  pausedAt: string | null;
  serverNow: string;
}

export interface MatchParticipant {
  userId: string;
  side: MatchSide;
  displayName?: string;
  connected: boolean;
  lastSeenAt: string | null;
}

export interface MatchMove {
  ply: number;
  side: MatchSide;
  from: string;
  to: string;
  uci: string;
  san?: string;
  promotion?: "queen" | "rook" | "bishop" | "knight";
  durationMs?: number;
  fenBefore?: string;
  fenAfter?: string;
  positionHash: string;
  /** Serialized deterministic Rule Architect engine state after the move. */
  ruleState?: JsonValue;
  ruleStateHash?: string;
}

export interface MatchResult {
  winner: MatchSide | null;
  reason:
    | "checkmate"
    | "stalemate"
    | "draw"
    | "timeout"
    | "resignation"
    | "abandonment"
    | "server";
}

export interface MatchEventPayloadMap {
  "match.waiting": {
    participants: MatchParticipant[];
    clock: ServerClockAnchor | null;
  };
  "match.started": {
    participants: MatchParticipant[];
    currentSide: MatchSide;
    clock: ServerClockAnchor;
    initialPositionHash: string;
  };
  "move.committed": {
    move: MatchMove;
    nextSide: MatchSide;
    clock: ServerClockAnchor;
  };
  "participant.connected": {
    userId: string;
    side: MatchSide;
    observedAt: string;
  };
  "participant.disconnected": {
    userId: string;
    side: MatchSide;
    observedAt: string;
    graceExpiresAt: string;
  };
  "match.paused": {
    reason: "disconnect" | "server" | "manual";
    clock: ServerClockAnchor;
  };
  "match.resumed": {
    currentSide: MatchSide;
    clock: ServerClockAnchor;
  };
  "match.finished": {
    result: MatchResult;
    clock: ServerClockAnchor;
    finalPositionHash: string;
  };
  "match.abandoned": {
    abandonedBy: string;
    result: MatchResult;
    clock: ServerClockAnchor;
  };
}

export type MatchEventType = keyof MatchEventPayloadMap;

export type PersistedMatchEvent<Type extends MatchEventType = MatchEventType> =
  Type extends MatchEventType
    ? {
        eventId: string;
        clientEventId: string | null;
        sequence: number;
        revision: number;
        identity: MatchIdentity;
        actorId: string | null;
        type: Type;
        payload: MatchEventPayloadMap[Type];
        occurredAt: string;
      }
    : never;

export type AnyPersistedMatchEvent = {
  [Type in MatchEventType]: PersistedMatchEvent<Type>;
}[MatchEventType];

export interface SubmitMoveCommand {
  type: "move";
  clientCommandId: string;
  identity: MatchIdentity;
  expectedRevision: number;
  uci: string;
  submittedClockMs?: number;
  createdAtClient: string;
}

export type MatchCommand = SubmitMoveCommand;

export interface MatchCommandReceipt {
  commandId: string;
  clientCommandId: string;
  commandSequence: number;
  status: "pending" | "accepted" | "rejected" | "superseded";
  authoritativeRevision: number;
}

export interface MatchHeartbeat {
  serverNow: string;
  authoritativeRevision: number;
  eventSequence: number;
  /** Refreshed server observations used only for presence leases. */
  participants: MatchParticipant[];
}

export interface MatchFinalizationReceipt {
  finalized: boolean;
  result: "1-0" | "0-1" | "1/2-1/2";
  termination: "timeout" | "resignation";
  authoritativeRevision: number;
  serverNow: string;
}

export interface MultiplayerMatchSnapshot {
  identity: MatchIdentity;
  sequence: number;
  revision: number;
  phase: Exclude<MultiplayerPhase, "synchronizing" | "error">;
  currentSide: MatchSide | null;
  moves: MatchMove[];
  clock: ServerClockAnchor | null;
  participants: MatchParticipant[];
  result: MatchResult | null;
  capturedAt: string;
}

export interface MultiplayerMatchState {
  identity: MatchIdentity;
  phase: MultiplayerPhase;
  currentSide: MatchSide | null;
  moves: MatchMove[];
  clock: ServerClockAnchor | null;
  participants: MatchParticipant[];
  result: MatchResult | null;
  lastSequence: number;
  lastRevision: number;
  appliedEventIds: Readonly<Record<string, true>>;
  lastServerEventAt: string | null;
  error: string | null;
}

export interface MatchEventStore {
  loadSnapshot(matchId: string): Promise<MultiplayerMatchSnapshot | null>;
  listEventsAfter(
    matchId: string,
    afterSequence: number,
    limit: number,
  ): Promise<AnyPersistedMatchEvent[]>;
  submitCommand(command: MatchCommand): Promise<MatchCommandReceipt>;
  heartbeat(
    identity: MatchIdentity,
    lastSeenRevision: number,
  ): Promise<MatchHeartbeat>;
  claimTimeout(
    identity: MatchIdentity,
    expectedRevision: number,
  ): Promise<MatchFinalizationReceipt>;
  resignMatch(
    identity: MatchIdentity,
    expectedRevision: number,
  ): Promise<MatchFinalizationReceipt>;
}

export interface MatchRealtimeSubscription {
  unsubscribe(): Promise<void> | void;
}

export interface MatchRealtimeSource {
  subscribe(
    identity: MatchIdentity,
    handlers: {
      onEvent(event: AnyPersistedMatchEvent): void;
      onStatus(status: RealtimeConnectionStatus, error?: Error): void;
    },
  ): Promise<MatchRealtimeSubscription> | MatchRealtimeSubscription;
}

export interface MatchSyncView {
  state: MultiplayerMatchState;
  connection: RealtimeConnectionStatus;
  bufferedEvents: number;
  missingSequence: number | null;
}
