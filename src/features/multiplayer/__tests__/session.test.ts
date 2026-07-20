import { describe, expect, it } from "vitest";
import type {
  AnyPersistedMatchEvent,
  MatchCommand,
  MatchCommandReceipt,
  MatchEventStore,
  MatchFinalizationReceipt,
  MatchHeartbeat,
  MatchIdentity,
  MatchRealtimeSource,
  MatchRealtimeSubscription,
  MultiplayerMatchSnapshot,
  RealtimeConnectionStatus,
} from "../contracts";
import { MultiplayerMatchSession } from "../session";
import {
  asAnyEvent,
  clock,
  event,
  identity,
  move,
  participants,
  T0,
} from "./fixtures";

class FakeStore implements MatchEventStore {
  snapshot: MultiplayerMatchSnapshot | null = null;
  events: AnyPersistedMatchEvent[] = [];
  submitResult: MatchCommandReceipt | null = null;

  async loadSnapshot(): Promise<MultiplayerMatchSnapshot | null> {
    return this.snapshot;
  }

  async listEventsAfter(
    _matchId: string,
    afterSequence: number,
    limit: number,
  ): Promise<AnyPersistedMatchEvent[]> {
    return this.events
      .filter((item) => item.sequence > afterSequence)
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, limit);
  }

  async submitCommand(command: MatchCommand): Promise<MatchCommandReceipt> {
    if (!this.submitResult) throw new Error("submitResult absent");
    return {
      ...this.submitResult,
      clientCommandId: command.clientCommandId,
    };
  }

  async heartbeat(): Promise<MatchHeartbeat> {
    return {
      serverNow: T0,
      authoritativeRevision: 0,
      eventSequence: 1,
      participants,
    };
  }

  async claimTimeout(): Promise<MatchFinalizationReceipt> {
    return {
      finalized: true,
      result: "1-0",
      termination: "timeout",
      authoritativeRevision: 1,
      serverNow: T0,
    };
  }

  async resignMatch(): Promise<MatchFinalizationReceipt> {
    return {
      finalized: true,
      result: "0-1",
      termination: "resignation",
      authoritativeRevision: 1,
      serverNow: T0,
    };
  }
}

class FakeRealtime implements MatchRealtimeSource {
  private handlers: {
    onEvent(event: AnyPersistedMatchEvent): void;
    onStatus(status: RealtimeConnectionStatus, error?: Error): void;
  } | null = null;

  subscribe(
    _identity: MatchIdentity,
    handlers: {
      onEvent(event: AnyPersistedMatchEvent): void;
      onStatus(status: RealtimeConnectionStatus, error?: Error): void;
    },
  ): MatchRealtimeSubscription {
    this.handlers = handlers;
    handlers.onStatus("connected");
    return { unsubscribe: () => undefined };
  }

  emit(event: AnyPersistedMatchEvent): void {
    this.handlers?.onEvent(event);
  }
}

const waitUntil = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Condition de test non atteinte.");
};

const initialHistory = (): AnyPersistedMatchEvent[] => [
  asAnyEvent(
    event(1, "match.started", {
      participants,
      currentSide: "white",
      clock: clock(),
      initialPositionHash: "initial",
    }),
  ),
];

describe("MultiplayerMatchSession", () => {
  it("subscribes before replay and catches up persisted history", async () => {
    const store = new FakeStore();
    store.events = initialHistory();
    const realtime = new FakeRealtime();
    const session = new MultiplayerMatchSession(identity, store, realtime);

    await session.start();
    await waitUntil(() => session.view.connection === "connected");

    expect(session.view.state.phase).toBe("playing");
    expect(session.view.state.lastSequence).toBe(1);
    expect(session.view.missingSequence).toBeNull();
    await session.stop();
  });

  it("recovers a missing sequence before applying a later Realtime event", async () => {
    const store = new FakeStore();
    store.events = initialHistory();
    const realtime = new FakeRealtime();
    const session = new MultiplayerMatchSession(identity, store, realtime);
    await session.start();
    await waitUntil(() => session.view.state.lastSequence === 1);

    const sequence2 = asAnyEvent(
      event(2, "participant.disconnected", {
        userId: "player-black",
        side: "black",
        observedAt: T0,
        graceExpiresAt: new Date(Date.parse(T0) + 60_000).toISOString(),
      }),
    );
    const sequence3 = asAnyEvent(
      event(3, "participant.connected", {
        userId: "player-black",
        side: "black",
        observedAt: new Date(Date.parse(T0) + 5_000).toISOString(),
      }),
    );
    store.events.push(sequence2);
    realtime.emit(sequence3);

    await waitUntil(() => session.view.state.lastSequence === 3);
    expect(session.view.bufferedEvents).toBe(0);
    expect(
      session.view.state.participants.find(
        (item) => item.userId === "player-black",
      )?.connected,
    ).toBe(true);
    await session.stop();
  });

  it("keeps a pending receipt unprojected until the canonical event", async () => {
    const store = new FakeStore();
    store.events = initialHistory();
    const realtime = new FakeRealtime();
    const session = new MultiplayerMatchSession(identity, store, realtime);
    await session.start();
    await waitUntil(() => session.view.connection === "connected");

    store.submitResult = {
      commandId: "44444444-4444-4444-8444-444444444444",
      clientCommandId: "33333333-3333-4333-8333-333333333333",
      commandSequence: 1,
      status: "pending",
      authoritativeRevision: 0,
    };
    const command: MatchCommand = {
      type: "move",
      clientCommandId: "33333333-3333-4333-8333-333333333333",
      identity,
      expectedRevision: 0,
      uci: "e2e4",
      createdAtClient: T0,
    };

    const receipt = await session.submitCommand(command);
    expect(receipt.status).toBe("pending");
    expect(session.view.state.moves).toEqual([]);

    realtime.emit(
      asAnyEvent(
        event(2, "move.committed", {
          move: move(1, "white", "e2", "e4"),
          nextSide: "black",
          clock: clock("black"),
        }),
      ),
    );
    await waitUntil(() => session.view.state.moves.length === 1);
    expect(session.view.state.moves.map((item) => item.uci)).toEqual(["e2e4"]);

    session.setBrowserOnline(false);
    await expect(
      session.submitCommand({
        ...command,
        clientCommandId: "55555555-5555-4555-8555-555555555555",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("non confirmée");
    await session.stop();
  });

  it("keeps server terminal receipts unprojected until canonical events", async () => {
    const store = new FakeStore();
    store.events = initialHistory();
    const session = new MultiplayerMatchSession(
      identity,
      store,
      new FakeRealtime(),
    );
    await session.start();
    await waitUntil(() => session.view.state.phase === "playing");

    const resignation = await session.resignMatch();
    expect(resignation).toMatchObject({
      finalized: true,
      termination: "resignation",
    });
    const timeout = await session.claimTimeout();
    expect(timeout).toMatchObject({ finalized: true, termination: "timeout" });
    expect(session.view.state.phase).toBe("playing");
    expect(session.view.state.result).toBeNull();

    session.setBrowserOnline(false);
    await expect(session.resignMatch()).rejects.toThrow("non confirmée");
    await expect(session.claimTimeout()).rejects.toThrow("non confirmée");
    await session.stop();
  });
});
