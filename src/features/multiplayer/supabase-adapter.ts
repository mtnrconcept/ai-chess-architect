import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnyPersistedMatchEvent,
  JsonValue,
  MatchCommand,
  MatchCommandReceipt,
  MatchEventStore,
  MatchFinalizationReceipt,
  MatchIdentity,
  MatchHeartbeat,
  MatchMove,
  MatchParticipant,
  MatchRealtimeSource,
  MatchRealtimeSubscription,
  MatchResult,
  MultiplayerMatchSnapshot,
  RealtimeConnectionStatus,
  ServerClockAnchor,
} from "./contracts";
import {
  assertCompatibleMatchIdentity,
  normalizeMatchIdentity,
} from "./identity";
import { STANDARD_START_FEN } from "./fen";
import {
  isRecord,
  parseIsoTimestamp,
  parsePersistedMatchEvent,
} from "./validation";

export interface MultiplayerSupabaseContract {
  schema: string;
  eventsTable: string;
  rpc: {
    loadSnapshot: string;
    listEventsAfter: string;
    submitCommand: string;
    heartbeat: string;
    claimTimeout: string;
    resignMatch: string;
  };
}

/** All names are centralized so a versioned backend rename is atomic. */
export const DEFAULT_MULTIPLAYER_SUPABASE_CONTRACT: MultiplayerSupabaseContract =
  Object.freeze({
    schema: "public",
    eventsTable: "chess_match_events",
    rpc: Object.freeze({
      loadSnapshot: "get_chess_match_snapshot",
      listEventsAfter: "get_chess_match_events_since",
      submitCommand: "submit_chess_move_command",
      heartbeat: "heartbeat_chess_room",
      claimTimeout: "claim_chess_timeout",
      resignMatch: "resign_chess_match",
    }),
  });

interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface DynamicRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

interface PostgresChangePayload {
  new: unknown;
}

type RealtimeStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | string;

interface DynamicRealtimeChannel {
  on(
    type: "postgres_changes",
    filter: {
      event: "INSERT";
      schema: string;
      table: string;
      filter: string;
    },
    callback: (payload: PostgresChangePayload) => void,
  ): DynamicRealtimeChannel;
  subscribe(
    callback: (status: RealtimeStatus, error?: Error) => void,
  ): DynamicRealtimeChannel;
}

interface DynamicRealtimeClient {
  channel(name: string): DynamicRealtimeChannel;
  removeChannel(channel: DynamicRealtimeChannel): PromiseLike<unknown>;
}

interface PlatformContext {
  identity: MatchIdentity;
  snapshot: Record<string, unknown>;
}

class SnapshotWatermarkMismatchError extends Error {
  constructor() {
    super("Snapshot refusé: journal serveur incomplet ou non continu.");
    this.name = "SnapshotWatermarkMismatchError";
  }
}

const SNAPSHOT_READ_ATTEMPTS = 3;

const validateSqlIdentifier = (value: string, label: string): string => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`${label} Supabase invalide.`);
  }
  return value;
};

const firstRow = (data: unknown): unknown =>
  Array.isArray(data) ? (data[0] ?? null) : data;

const rows = (data: unknown): unknown[] =>
  Array.isArray(data)
    ? data
    : data === null || data === undefined
      ? []
      : [data];

const throwRpcError = (operation: string, result: RpcResult): void => {
  if (!result.error) return;
  const suffix = result.error.code ? ` (${result.error.code})` : "";
  throw new Error(`${operation} a échoué${suffix}: ${result.error.message}`);
};

const mapRealtimeStatus = (
  status: RealtimeStatus,
): RealtimeConnectionStatus => {
  switch (status) {
    case "SUBSCRIBED":
      return "connected";
    case "TIMED_OUT":
    case "CHANNEL_ERROR":
      return "reconnecting";
    case "CLOSED":
      return "closed";
    default:
      return "connecting";
  }
};

const requiredRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} invalide.`);
  return value;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} invalide.`);
  }
  return value.trim();
};

const safeInteger = (value: unknown, label: string, minimum = 0): number => {
  const number = typeof value === "string" ? Number(value) : value;
  if (
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number < minimum
  ) {
    throw new Error(`${label} invalide.`);
  }
  return number;
};

const platformIdentity = (row: Record<string, unknown>): MatchIdentity =>
  normalizeMatchIdentity({
    matchId: requiredString(row.match_id, "match_id"),
    lobbyId: requiredString(row.room_id, "room_id"),
    rulesetHash: requiredString(row.ruleset_hash, "ruleset_hash"),
    matchSeed:
      typeof row.shared_seed === "number" || typeof row.shared_seed === "string"
        ? row.shared_seed
        : requiredString(row.shared_seed, "shared_seed"),
    engineVersion: requiredString(row.engine_version, "engine_version"),
  });

const platformParticipants = (
  value: unknown,
  snapshot: Record<string, unknown>,
): MatchParticipant[] => {
  const presenceRows = Array.isArray(value) ? value : [];
  const fallback = new Map<string, "white" | "black">();
  if (typeof snapshot.white_player_id === "string") {
    fallback.set(snapshot.white_player_id, "white");
  }
  if (typeof snapshot.black_player_id === "string") {
    fallback.set(snapshot.black_player_id, "black");
  }

  const mapped = presenceRows.flatMap((entry): MatchParticipant[] => {
    if (!isRecord(entry) || typeof entry.userId !== "string") return [];
    const side =
      entry.color === "white" || entry.color === "black"
        ? entry.color
        : fallback.get(entry.userId);
    if (!side) return [];
    return [
      {
        userId: entry.userId,
        side,
        connected: entry.presence === "online",
        lastSeenAt:
          typeof entry.lastSeenAt === "string" ? entry.lastSeenAt : null,
      },
    ];
  });

  if (mapped.length > 0) return mapped;
  return [...fallback].map(([userId, side]) => ({
    userId,
    side,
    connected: false,
    lastSeenAt: null,
  }));
};

const clockValue = (
  clockState: Record<string, unknown>,
  camel: string,
  snake: string,
): number => safeInteger(clockState[camel] ?? clockState[snake] ?? 0, camel);

const platformClock = (
  clockStateValue: unknown,
  activeSide: "white" | "black" | null,
  serverNowValue: unknown,
  turnStartedAtValue: unknown,
  paused: boolean,
): ServerClockAnchor => {
  const clockState = requiredRecord(clockStateValue, "clock_state");
  const serverNow = parseIsoTimestamp(serverNowValue, "server_now");
  const turnStartedAt =
    typeof turnStartedAtValue === "string"
      ? parseIsoTimestamp(turnStartedAtValue, "turn_started_at")
      : null;
  const elapsedSinceStoredClockMs =
    !paused && activeSide !== null && turnStartedAt !== null
      ? Math.max(0, Date.parse(serverNow) - Date.parse(turnStartedAt))
      : 0;
  const storedWhiteMs = clockValue(clockState, "whiteMs", "white_ms");
  const storedBlackMs = clockValue(clockState, "blackMs", "black_ms");
  return {
    whiteRemainingMs: Math.max(
      0,
      storedWhiteMs - (activeSide === "white" ? elapsedSinceStoredClockMs : 0),
    ),
    blackRemainingMs: Math.max(
      0,
      storedBlackMs - (activeSide === "black" ? elapsedSinceStoredClockMs : 0),
    ),
    activeSide: paused ? null : activeSide,
    turnStartedAt,
    pausedAt: paused ? serverNow : null,
    serverNow,
  };
};

const resultFromPlatform = (
  result: unknown,
  termination: unknown,
): MatchResult => {
  const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : null;
  const label =
    typeof termination === "string" ? termination.toLowerCase() : "";
  const reason: MatchResult["reason"] =
    result === "1/2-1/2"
      ? label.includes("stale")
        ? "stalemate"
        : "draw"
      : label.includes("checkmate") || label.includes("mat")
        ? "checkmate"
        : label.includes("timeout") || label.includes("time")
          ? "timeout"
          : label.includes("resign")
            ? "resignation"
            : label.includes("abandon")
              ? "abandonment"
              : "server";
  return { winner, reason };
};

const promotionFromUci = (uci: string): MatchMove["promotion"] => {
  switch (uci[4]?.toLowerCase()) {
    case "q":
      return "queen";
    case "r":
      return "rook";
    case "b":
      return "bishop";
    case "n":
      return "knight";
    default:
      return undefined;
  }
};

const finalizationReceipt = (
  value: unknown,
  expectedRevision: number,
  expectedTermination: MatchFinalizationReceipt["termination"],
): MatchFinalizationReceipt => {
  const row = requiredRecord(firstRow(value), "Réponse de finalisation");
  if (row.finalized !== true && row.finalized !== false) {
    throw new Error("Statut de finalisation invalide.");
  }
  if (
    row.result !== "1-0" &&
    row.result !== "0-1" &&
    row.result !== "1/2-1/2"
  ) {
    throw new Error("Résultat de finalisation invalide.");
  }
  if (row.termination !== expectedTermination) {
    throw new Error("Motif de finalisation incompatible.");
  }
  const authoritativeRevision = safeInteger(
    row.authoritative_revision,
    "authoritative_revision",
  );
  if (authoritativeRevision !== expectedRevision + 1) {
    throw new Error("Révision de finalisation incompatible.");
  }
  return {
    finalized: row.finalized,
    result: row.result,
    termination: expectedTermination,
    authoritativeRevision,
    serverNow: parseIsoTimestamp(row.server_now, "server_now"),
  };
};

const platformEvent = (
  value: unknown,
  context: PlatformContext,
): AnyPersistedMatchEvent => {
  const row = requiredRecord(value, "Événement chess_match_events");
  const payload = requiredRecord(row.payload, "event.payload");
  const sequence = safeInteger(row.sequence, "event.sequence", 1);
  const revision = safeInteger(row.revision, "event.revision");
  if (sequence !== revision + 1) {
    throw new Error("Événement: séquence et révision incompatibles.");
  }
  if (
    typeof row.match_id === "string" &&
    row.match_id.toLowerCase() !== context.identity.matchId
  ) {
    throw new Error("L'événement appartient à un autre match.");
  }
  const eventId = requiredString(row.event_id ?? row.id, "event_id");
  const occurredAt = requiredString(row.created_at, "created_at");
  const serverNow = row.server_now ?? payload.serverNow ?? occurredAt;
  const snapshot = context.snapshot;
  const participants = platformParticipants(
    snapshot.players_presence,
    snapshot,
  );
  const eventType = requiredString(row.event_type, "event_type");

  if (eventType === "match_started") {
    assertCompatibleMatchIdentity(
      context.identity,
      normalizeMatchIdentity({
        matchId: context.identity.matchId,
        lobbyId: context.identity.lobbyId,
        rulesetHash: requiredString(payload.rulesetHash, "rulesetHash"),
        matchSeed:
          typeof payload.sharedSeed === "number" ||
          typeof payload.sharedSeed === "string"
            ? payload.sharedSeed
            : requiredString(payload.sharedSeed, "sharedSeed"),
        engineVersion: requiredString(payload.engineVersion, "engineVersion"),
      }),
    );
    return parsePersistedMatchEvent({
      eventId,
      clientEventId: null,
      sequence,
      revision,
      identity: context.identity,
      actorId: row.actor_id ?? null,
      type: "match.started",
      payload: {
        participants,
        currentSide: "white",
        clock: platformClock(
          snapshot.clock_state,
          "white",
          serverNow,
          snapshot.turn_started_at ?? occurredAt,
          false,
        ),
        initialPositionHash: requiredString(
          payload.positionHash ?? snapshot.position_hash,
          "positionHash",
        ),
      },
      occurredAt,
    });
  }

  if (eventType === "move_committed") {
    assertCompatibleMatchIdentity(
      context.identity,
      normalizeMatchIdentity({
        matchId: context.identity.matchId,
        lobbyId: context.identity.lobbyId,
        rulesetHash: requiredString(payload.rulesetHash, "rulesetHash"),
        matchSeed:
          typeof payload.matchSeed === "number" ||
          typeof payload.matchSeed === "string"
            ? payload.matchSeed
            : requiredString(payload.matchSeed, "matchSeed"),
        engineVersion: requiredString(payload.engineVersion, "engineVersion"),
      }),
    );
    const uci = requiredString(payload.uci, "move.uci").toLowerCase();
    const side = requiredString(payload.side, "move.side");
    const nextSide = requiredString(payload.nextSide, "move.nextSide");
    if (
      (side !== "white" && side !== "black") ||
      (nextSide !== "white" && nextSide !== "black")
    ) {
      throw new Error("Camp de move_committed invalide.");
    }
    const ruleState = payload.ruleState;
    return parsePersistedMatchEvent({
      eventId,
      clientEventId:
        typeof payload.clientMoveId === "string" ? payload.clientMoveId : null,
      sequence,
      revision,
      identity: context.identity,
      actorId: row.actor_id ?? null,
      type: "move.committed",
      payload: {
        move: {
          ply: safeInteger(payload.ply, "move.ply", 1),
          side,
          from: requiredString(payload.from ?? uci.slice(0, 2), "move.from"),
          to: requiredString(payload.to ?? uci.slice(2, 4), "move.to"),
          uci,
          san: typeof payload.san === "string" ? payload.san : undefined,
          promotion: promotionFromUci(uci),
          durationMs: safeInteger(payload.durationMs ?? 0, "move.durationMs"),
          fenBefore: requiredString(payload.fenBefore, "move.fenBefore"),
          fenAfter: requiredString(payload.fenAfter, "move.fenAfter"),
          positionHash: requiredString(payload.positionHash, "positionHash"),
          ruleState: ruleState as JsonValue | undefined,
          ruleStateHash: requiredString(payload.ruleStateHash, "ruleStateHash"),
        },
        nextSide,
        clock: platformClock(
          payload.clockState ?? payload.clock_state,
          nextSide,
          serverNow,
          payload.turnStartedAt ?? occurredAt,
          false,
        ),
      },
      occurredAt,
    });
  }

  if (eventType === "match_verified" || eventType === "match_abandoned") {
    const result = resultFromPlatform(payload.result, payload.termination);
    const clock = platformClock(
      snapshot.clock_state,
      null,
      serverNow,
      snapshot.turn_started_at,
      true,
    );
    return parsePersistedMatchEvent({
      eventId,
      clientEventId: null,
      sequence,
      revision,
      identity: context.identity,
      actorId: row.actor_id ?? null,
      type:
        eventType === "match_verified" ? "match.finished" : "match.abandoned",
      payload:
        eventType === "match_verified"
          ? {
              result,
              clock,
              finalPositionHash: requiredString(
                payload.positionHash ?? snapshot.position_hash,
                "positionHash",
              ),
            }
          : {
              abandonedBy: requiredString(
                payload.abandonedBy ?? row.actor_id,
                "abandonedBy",
              ),
              result,
              clock,
            },
      occurredAt,
    });
  }

  throw new Error(`Événement serveur non supporté: ${eventType}.`);
};

/**
 * Adapter for the additive chess platform migration. No local or legacy
 * lobbies.game_state fallback exists: missing server contracts fail closed.
 */
export class SupabaseMultiplayerAdapter
  implements MatchEventStore, MatchRealtimeSource
{
  private readonly contract: MultiplayerSupabaseContract;
  private readonly rpcClient: DynamicRpcClient;
  private readonly realtimeClient: DynamicRealtimeClient;
  private readonly contexts = new Map<string, PlatformContext>();

  constructor(
    client: SupabaseClient,
    contract: MultiplayerSupabaseContract = DEFAULT_MULTIPLAYER_SUPABASE_CONTRACT,
  ) {
    this.contract = {
      schema: validateSqlIdentifier(contract.schema, "Schema"),
      eventsTable: validateSqlIdentifier(
        contract.eventsTable,
        "Table Realtime",
      ),
      rpc: {
        loadSnapshot: validateSqlIdentifier(
          contract.rpc.loadSnapshot,
          "RPC snapshot",
        ),
        listEventsAfter: validateSqlIdentifier(
          contract.rpc.listEventsAfter,
          "RPC historique",
        ),
        submitCommand: validateSqlIdentifier(
          contract.rpc.submitCommand,
          "RPC commande",
        ),
        heartbeat: validateSqlIdentifier(
          contract.rpc.heartbeat,
          "RPC heartbeat",
        ),
        claimTimeout: validateSqlIdentifier(
          contract.rpc.claimTimeout,
          "RPC réclamation au temps",
        ),
        resignMatch: validateSqlIdentifier(
          contract.rpc.resignMatch,
          "RPC abandon",
        ),
      },
    };
    this.rpcClient = client as unknown as DynamicRpcClient;
    this.realtimeClient = client as unknown as DynamicRealtimeClient;
  }

  async loadSnapshot(
    matchId: string,
  ): Promise<MultiplayerMatchSnapshot | null> {
    let lastWatermarkError: SnapshotWatermarkMismatchError | null = null;
    for (let attempt = 0; attempt < SNAPSHOT_READ_ATTEMPTS; attempt += 1) {
      const context = await this.loadContext(matchId);
      if (!context) return null;
      try {
        return await this.loadSnapshotFromContext(matchId, context);
      } catch (error) {
        if (!(error instanceof SnapshotWatermarkMismatchError)) throw error;
        lastWatermarkError = error;
      }
    }
    throw lastWatermarkError ?? new SnapshotWatermarkMismatchError();
  }

  private async loadSnapshotFromContext(
    matchId: string,
    context: PlatformContext,
  ): Promise<MultiplayerMatchSnapshot> {
    const snapshot = context.snapshot;
    const revision = safeInteger(snapshot.revision, "snapshot.revision");
    const sequence = safeInteger(
      snapshot.event_sequence,
      "snapshot.event_sequence",
      1,
    );
    if (sequence !== revision + 1) {
      throw new Error("Snapshot: séquence et révision incompatibles.");
    }

    const allEvents = await this.fetchAllEvents(matchId, -1, context);
    if (
      allEvents.length !== sequence ||
      allEvents.some((event, index) => event.sequence !== index + 1)
    ) {
      throw new SnapshotWatermarkMismatchError();
    }
    const moves = allEvents
      .filter(
        (
          event,
        ): event is Extract<
          AnyPersistedMatchEvent,
          { type: "move.committed" }
        > => event.type === "move.committed",
      )
      .map((event) => event.payload.move);
    const plyCount = safeInteger(snapshot.ply_count, "snapshot.ply_count");
    if (moves.length !== plyCount) {
      throw new Error(
        "Snapshot refusé: nombre de coups incompatible avec le journal.",
      );
    }
    const currentFen = requiredString(
      snapshot.current_fen,
      "snapshot.current_fen",
    );
    const positionHash = requiredString(
      snapshot.position_hash,
      "snapshot.position_hash",
    );
    const latestMove = moves[moves.length - 1];
    if (latestMove) {
      if (
        latestMove.fenAfter !== currentFen ||
        latestMove.positionHash !== positionHash
      ) {
        throw new Error(
          "Snapshot refusé: position finale incompatible avec le dernier coup.",
        );
      }
    } else if (currentFen !== STANDARD_START_FEN) {
      throw new Error(
        "Snapshot refusé: position initiale standard incompatible.",
      );
    }
    const terminal = [...allEvents]
      .reverse()
      .find(
        (event) =>
          event.type === "match.finished" || event.type === "match.abandoned",
      );
    const status = requiredString(snapshot.match_status, "match_status");
    const phase: MultiplayerMatchSnapshot["phase"] =
      status === "active"
        ? "playing"
        : status === "pending"
          ? "waiting"
          : status === "completed"
            ? "finished"
            : "abandoned";
    const serverNow = parseIsoTimestamp(snapshot.server_now, "server_now");
    const currentSide =
      snapshot.side_to_move === "white" || snapshot.side_to_move === "black"
        ? snapshot.side_to_move
        : null;

    return {
      identity: context.identity,
      sequence,
      revision,
      phase,
      currentSide: phase === "playing" ? currentSide : null,
      moves,
      clock: platformClock(
        snapshot.clock_state,
        phase === "playing" ? currentSide : null,
        serverNow,
        snapshot.turn_started_at,
        phase !== "playing",
      ),
      participants: platformParticipants(snapshot.players_presence, snapshot),
      result:
        terminal?.type === "match.finished" ||
        terminal?.type === "match.abandoned"
          ? terminal.payload.result
          : null,
      capturedAt: serverNow,
    };
  }

  async listEventsAfter(
    matchId: string,
    afterSequence: number,
    limit: number,
  ): Promise<AnyPersistedMatchEvent[]> {
    const context =
      this.contexts.get(matchId) ?? (await this.loadContext(matchId));
    if (!context) return [];
    const result = await this.rpcClient.rpc(this.contract.rpc.listEventsAfter, {
      p_match_id: matchId,
      p_after_revision: afterSequence - 1,
      p_limit: limit,
    });
    throwRpcError("Reprise de l'historique", result);
    return rows(result.data).map((row) => platformEvent(row, context));
  }

  async submitCommand(command: MatchCommand): Promise<MatchCommandReceipt> {
    const context =
      this.contexts.get(command.identity.matchId) ??
      (await this.loadContext(command.identity.matchId));
    if (!context) throw new Error("Match introuvable pour la commande.");
    assertCompatibleMatchIdentity(command.identity, context.identity);
    const result = await this.rpcClient.rpc(this.contract.rpc.submitCommand, {
      p_match_id: command.identity.matchId,
      p_expected_revision: command.expectedRevision,
      p_client_command_id: command.clientCommandId,
      p_uci: command.uci,
      p_submitted_clock_ms: command.submittedClockMs ?? null,
    });
    throwRpcError("Soumission de la commande", result);
    const row = requiredRecord(firstRow(result.data), "Receipt de commande");
    const status = requiredString(row.command_status, "command_status");
    if (!["pending", "accepted", "rejected", "superseded"].includes(status)) {
      throw new Error("Statut de commande inconnu.");
    }
    return {
      commandId: requiredString(row.command_id, "command_id"),
      clientCommandId: command.clientCommandId,
      commandSequence: safeInteger(row.command_sequence, "command_sequence", 1),
      status: status as MatchCommandReceipt["status"],
      authoritativeRevision: safeInteger(
        row.authoritative_revision,
        "authoritative_revision",
      ),
    };
  }

  async heartbeat(
    identity: MatchIdentity,
    lastSeenRevision: number,
  ): Promise<MatchHeartbeat> {
    const result = await this.rpcClient.rpc(this.contract.rpc.heartbeat, {
      p_room_id: identity.lobbyId,
      p_last_seen_revision: Math.max(0, lastSeenRevision),
    });
    throwRpcError("Heartbeat multijoueur", result);
    const row = requiredRecord(firstRow(result.data), "Réponse heartbeat");
    if (
      requiredString(row.match_id, "heartbeat.match_id") !== identity.matchId
    ) {
      throw new Error("Le heartbeat appartient à un autre match.");
    }
    const authoritativeRevision = safeInteger(
      row.match_revision,
      "match_revision",
    );
    const eventSequence = safeInteger(row.event_sequence, "event_sequence", 1);
    if (eventSequence !== authoritativeRevision + 1) {
      throw new Error("Heartbeat: séquence et révision incompatibles.");
    }
    // The heartbeat RPC intentionally stays compact. Refreshing the protected
    // snapshot supplies both players' leases without subscribing to room rows.
    const context = await this.loadContext(identity.matchId);
    if (!context) throw new Error("Snapshot absent après heartbeat.");
    assertCompatibleMatchIdentity(identity, context.identity);
    return {
      serverNow: parseIsoTimestamp(row.server_now, "server_now"),
      authoritativeRevision,
      eventSequence,
      participants: platformParticipants(
        context.snapshot.players_presence,
        context.snapshot,
      ),
    };
  }

  async claimTimeout(
    identity: MatchIdentity,
    expectedRevision: number,
  ): Promise<MatchFinalizationReceipt> {
    await this.assertKnownIdentity(identity);
    const result = await this.rpcClient.rpc(this.contract.rpc.claimTimeout, {
      p_match_id: identity.matchId,
      p_expected_revision: expectedRevision,
    });
    throwRpcError("Réclamation au temps", result);
    return finalizationReceipt(result.data, expectedRevision, "timeout");
  }

  async resignMatch(
    identity: MatchIdentity,
    expectedRevision: number,
  ): Promise<MatchFinalizationReceipt> {
    await this.assertKnownIdentity(identity);
    const result = await this.rpcClient.rpc(this.contract.rpc.resignMatch, {
      p_match_id: identity.matchId,
      p_expected_revision: expectedRevision,
    });
    throwRpcError("Abandon de la partie", result);
    return finalizationReceipt(result.data, expectedRevision, "resignation");
  }

  subscribe(
    identity: MatchIdentity,
    handlers: {
      onEvent(event: AnyPersistedMatchEvent): void;
      onStatus(status: RealtimeConnectionStatus, error?: Error): void;
    },
  ): MatchRealtimeSubscription {
    const channel = this.realtimeClient
      .channel(`chess-match-${identity.matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: this.contract.schema,
          table: this.contract.eventsTable,
          filter: `match_id=eq.${identity.matchId}`,
        },
        (payload) => {
          void this.mapRealtimeEvent(identity, payload.new)
            .then(handlers.onEvent)
            .catch((error: unknown) => {
              handlers.onStatus(
                "error",
                error instanceof Error
                  ? error
                  : new Error("Événement Realtime invalide."),
              );
            });
        },
      )
      .subscribe((status, error) => {
        handlers.onStatus(mapRealtimeStatus(status), error);
      });

    return {
      unsubscribe: async () => {
        await this.realtimeClient.removeChannel(channel);
      },
    };
  }

  private async loadContext(matchId: string): Promise<PlatformContext | null> {
    const result = await this.rpcClient.rpc(this.contract.rpc.loadSnapshot, {
      p_match_id: matchId,
    });
    throwRpcError("Chargement du snapshot", result);
    const value = firstRow(result.data);
    if (value === null || value === undefined) return null;
    const snapshot = requiredRecord(value, "Snapshot chess match");
    const context = { identity: platformIdentity(snapshot), snapshot };
    this.contexts.set(matchId, context);
    return context;
  }

  private async assertKnownIdentity(identity: MatchIdentity): Promise<void> {
    const context =
      this.contexts.get(identity.matchId) ??
      (await this.loadContext(identity.matchId));
    if (!context) throw new Error("Match introuvable pour la finalisation.");
    assertCompatibleMatchIdentity(identity, context.identity);
  }

  private async fetchAllEvents(
    matchId: string,
    initialRevision: number,
    context: PlatformContext,
  ): Promise<AnyPersistedMatchEvent[]> {
    const events: AnyPersistedMatchEvent[] = [];
    let afterRevision = initialRevision;
    for (let page = 0; page < 100; page += 1) {
      const result = await this.rpcClient.rpc(
        this.contract.rpc.listEventsAfter,
        {
          p_match_id: matchId,
          p_after_revision: afterRevision,
          p_limit: 1_000,
        },
      );
      throwRpcError("Chargement des coups du snapshot", result);
      const pageRows = rows(result.data);
      if (pageRows.length === 0) break;
      const mapped = pageRows.map((row) => platformEvent(row, context));
      events.push(...mapped);
      afterRevision = mapped[mapped.length - 1].revision;
      if (pageRows.length < 1_000) break;
      if (page === 99) throw new Error("Historique du snapshot trop long.");
    }
    return events;
  }

  private async mapRealtimeEvent(
    expectedIdentity: MatchIdentity,
    value: unknown,
  ): Promise<AnyPersistedMatchEvent> {
    const context = await this.loadContext(expectedIdentity.matchId);
    if (!context) throw new Error("Snapshot indisponible pour Realtime.");
    assertCompatibleMatchIdentity(expectedIdentity, context.identity);
    return platformEvent(value, context);
  }
}
