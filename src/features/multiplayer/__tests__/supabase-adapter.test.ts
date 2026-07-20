import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { MatchCommand } from "../contracts";
import type { MatchRealtimeSubscription } from "../contracts";
import {
  DEFAULT_MULTIPLAYER_SUPABASE_CONTRACT,
  SupabaseMultiplayerAdapter,
} from "../supabase-adapter";
import { STANDARD_START_FEN } from "../fen";
import { HASH, identity, LOBBY_ID, MATCH_ID, T0 } from "./fixtures";

const WHITE_ID = "66666666-6666-4666-8666-666666666666";
const BLACK_ID = "77777777-7777-4777-8777-777777777777";
const COMMAND_ID = "88888888-8888-4888-8888-888888888888";
const CLIENT_COMMAND_ID = "99999999-9999-4999-8999-999999999999";
const T1 = "2026-07-20T12:00:03.000Z";
const T2 = "2026-07-20T12:00:05.000Z";

const snapshotRow = {
  match_id: MATCH_ID,
  room_id: LOBBY_ID,
  match_status: "active",
  white_player_id: WHITE_ID,
  black_player_id: BLACK_ID,
  ruleset_hash: HASH,
  shared_seed: identity.matchSeed,
  engine_version: identity.engineVersion,
  current_fen: "fen-after",
  position_hash: "position-after",
  rule_state: { rulesetHash: HASH },
  rule_state_hash: "rule-state-after",
  side_to_move: "black",
  ply_count: 1,
  revision: 1,
  event_sequence: 2,
  command_sequence: 1,
  clock_state: {
    whiteMs: 298_000,
    blackMs: 300_000,
    incrementMs: 2_000,
  },
  server_now: T2,
  turn_started_at: T1,
  players_presence: [
    {
      userId: WHITE_ID,
      color: "white",
      presence: "online",
      lastSeenAt: T2,
    },
    {
      userId: BLACK_ID,
      color: "black",
      presence: "away",
      lastSeenAt: T1,
    },
  ],
  verification_status: "pending",
};

const eventRows = [
  {
    event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    match_id: MATCH_ID,
    revision: 0,
    sequence: 1,
    event_type: "match_started",
    actor_id: null,
    payload: {
      rulesetHash: HASH,
      sharedSeed: identity.matchSeed,
      engineVersion: identity.engineVersion,
      positionHash: "position-initial",
    },
    created_at: T0,
    server_now: T0,
  },
  {
    event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    match_id: MATCH_ID,
    revision: 1,
    sequence: 2,
    event_type: "move_committed",
    actor_id: WHITE_ID,
    payload: {
      clientMoveId: CLIENT_COMMAND_ID,
      ply: 1,
      side: "white",
      nextSide: "black",
      uci: "e2e4",
      san: "e4",
      from: "e2",
      to: "e4",
      durationMs: 2_000,
      fenBefore: "fen-before",
      fenAfter: "fen-after",
      clockState: snapshotRow.clock_state,
      turnStartedAt: T1,
      serverNow: T1,
      ruleStateHash: "rule-state-after",
      positionHash: "position-after",
      rulesetHash: HASH,
      matchSeed: identity.matchSeed,
      engineVersion: identity.engineVersion,
    },
    created_at: T1,
    server_now: T2,
  },
];

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

interface FinalizationFixtures {
  claimTimeout?: unknown;
  resignMatch?: unknown;
}

class FakeChannel {
  changeFilter: Record<string, unknown> | null = null;
  private changeHandler: ((payload: { new: unknown }) => void) | null = null;

  on(
    _type: "postgres_changes",
    filter: Record<string, unknown>,
    callback: (payload: { new: unknown }) => void,
  ): this {
    this.changeFilter = filter;
    this.changeHandler = callback;
    return this;
  }

  subscribe(callback: (status: string) => void): this {
    callback("SUBSCRIBED");
    return this;
  }

  emit(row: unknown): void {
    this.changeHandler?.({ new: row });
  }
}

class FakeSupabaseClient {
  readonly calls: RpcCall[] = [];
  readonly realtimeChannel = new FakeChannel();
  removed = false;
  private snapshotReadIndex = 0;

  constructor(
    private readonly snapshot:
      | typeof snapshotRow
      | readonly (typeof snapshotRow)[] = snapshotRow,
    private readonly events = eventRows,
    private readonly finalizations: FinalizationFixtures = {},
  ) {}

  async rpc(name: string, args: Record<string, unknown> = {}) {
    this.calls.push({ name, args });
    switch (name) {
      case "get_chess_match_snapshot":
        if (Array.isArray(this.snapshot)) {
          const row =
            this.snapshot[
              Math.min(this.snapshotReadIndex, this.snapshot.length - 1)
            ];
          this.snapshotReadIndex += 1;
          return { data: [row], error: null };
        }
        return { data: [this.snapshot], error: null };
      case "get_chess_match_events_since": {
        const after = Number(args.p_after_revision);
        const limit = Number(args.p_limit);
        return {
          data: this.events
            .filter((row) => row.revision > after)
            .slice(0, limit),
          error: null,
        };
      }
      case "submit_chess_move_command":
        return {
          data: [
            {
              command_id: COMMAND_ID,
              command_sequence: 2,
              command_status: "pending",
              authoritative_revision: 1,
            },
          ],
          error: null,
        };
      case "heartbeat_chess_room":
        return {
          data: [
            {
              server_now: T2,
              room_status: "in_game",
              match_id: MATCH_ID,
              match_revision: 1,
              event_sequence: 2,
              turn_started_at: T1,
              clock_state: snapshotRow.clock_state,
            },
          ],
          error: null,
        };
      case "claim_chess_timeout":
        return {
          data: this.finalizations.claimTimeout ?? [
            {
              finalized: true,
              result: "1-0",
              termination: "timeout",
              authoritative_revision: 2,
              server_now: T2,
            },
          ],
          error: null,
        };
      case "resign_chess_match":
        return {
          data: this.finalizations.resignMatch ?? [
            {
              finalized: true,
              result: "0-1",
              termination: "resignation",
              authoritative_revision: 2,
              server_now: T2,
            },
          ],
          error: null,
        };
      default:
        throw new Error(`RPC de test inconnue: ${name}`);
    }
  }

  channel(): FakeChannel {
    return this.realtimeChannel;
  }

  async removeChannel(): Promise<void> {
    this.removed = true;
  }
}

const createAdapter = (
  snapshot: typeof snapshotRow | readonly (typeof snapshotRow)[] = snapshotRow,
  events: typeof eventRows = eventRows,
  finalizations: FinalizationFixtures = {},
) => {
  const client = new FakeSupabaseClient(snapshot, events, finalizations);
  const adapter = new SupabaseMultiplayerAdapter(
    client as unknown as SupabaseClient,
  );
  return { adapter, client };
};

describe("SupabaseMultiplayerAdapter", () => {
  it("uses the additive platform migration contract", () => {
    expect(DEFAULT_MULTIPLAYER_SUPABASE_CONTRACT).toEqual({
      schema: "public",
      eventsTable: "chess_match_events",
      rpc: {
        loadSnapshot: "get_chess_match_snapshot",
        listEventsAfter: "get_chess_match_events_since",
        submitCommand: "submit_chess_move_command",
        heartbeat: "heartbeat_chess_room",
        claimTimeout: "claim_chess_timeout",
        resignMatch: "resign_chess_match",
      },
    });
  });

  it("hydrates a snapshot from canonical replay without losing rule identity", async () => {
    const { adapter } = createAdapter();
    const snapshot = await adapter.loadSnapshot(MATCH_ID);

    expect(snapshot).toMatchObject({
      identity,
      sequence: 2,
      revision: 1,
      phase: "playing",
      currentSide: "black",
      moves: [
        {
          ply: 1,
          uci: "e2e4",
          positionHash: "position-after",
          ruleStateHash: "rule-state-after",
        },
      ],
      participants: [
        { userId: WHITE_ID, side: "white", connected: true },
        { userId: BLACK_ID, side: "black", connected: false },
      ],
    });
    expect(snapshot?.clock?.activeSide).toBe("black");
    expect(snapshot?.clock?.blackRemainingMs).toBe(298_000);
  });

  it("requires an exhaustive, continuous event journal", async () => {
    const missingEvent = createAdapter(snapshotRow, [eventRows[0]]);
    await expect(missingEvent.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /journal serveur incomplet ou non continu/,
    );

    const discontinuousEvents = [
      eventRows[0],
      { ...eventRows[1], revision: 2, sequence: 3 },
    ];
    const discontinuous = createAdapter(snapshotRow, discontinuousEvents);
    await expect(discontinuous.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /journal serveur incomplet ou non continu/,
    );
  });

  it("re-reads a racing snapshot at most three times", async () => {
    const staleSnapshot = {
      ...snapshotRow,
      current_fen: STANDARD_START_FEN,
      position_hash: "position-initial",
      side_to_move: "white",
      ply_count: 0,
      revision: 0,
      event_sequence: 1,
      command_sequence: 0,
    };
    const recovered = createAdapter([staleSnapshot, snapshotRow], eventRows);
    await expect(
      recovered.adapter.loadSnapshot(MATCH_ID),
    ).resolves.toMatchObject({ revision: 1, moves: [{ uci: "e2e4" }] });
    expect(
      recovered.client.calls.filter(
        (call) => call.name === "get_chess_match_snapshot",
      ),
    ).toHaveLength(2);

    const exhausted = createAdapter(staleSnapshot, eventRows);
    await expect(exhausted.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /journal serveur incomplet ou non continu/,
    );
    expect(
      exhausted.client.calls.filter(
        (call) => call.name === "get_chess_match_snapshot",
      ),
    ).toHaveLength(3);
  });

  it("binds ply count, final FEN and position hash to the committed replay", async () => {
    const wrongPly = createAdapter({ ...snapshotRow, ply_count: 2 });
    await expect(wrongPly.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /nombre de coups incompatible/,
    );

    const wrongFen = createAdapter({
      ...snapshotRow,
      current_fen: "different-fen",
    });
    await expect(wrongFen.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /position finale incompatible/,
    );
    expect(
      wrongFen.client.calls.filter(
        (call) => call.name === "get_chess_match_snapshot",
      ),
    ).toHaveLength(1);

    const wrongHash = createAdapter({
      ...snapshotRow,
      position_hash: "different-position-hash",
    });
    await expect(wrongHash.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /position finale incompatible/,
    );
  });

  it("accepts only the canonical standard FEN before the first move", async () => {
    const initialSnapshot = {
      ...snapshotRow,
      current_fen: STANDARD_START_FEN,
      position_hash: "position-initial",
      side_to_move: "white",
      ply_count: 0,
      revision: 0,
      event_sequence: 1,
      command_sequence: 0,
    };
    const initial = createAdapter(initialSnapshot, [eventRows[0]]);
    await expect(initial.adapter.loadSnapshot(MATCH_ID)).resolves.toMatchObject(
      {
        revision: 0,
        sequence: 1,
        moves: [],
      },
    );

    const invalidInitial = createAdapter(
      { ...initialSnapshot, current_fen: "8/8/8/8/8/8/8/8 w - - 0 1" },
      [eventRows[0]],
    );
    await expect(invalidInitial.adapter.loadSnapshot(MATCH_ID)).rejects.toThrow(
      /position initiale standard incompatible/,
    );
  });

  it("maps sequence cursors and persists a pending command without projecting it", async () => {
    const { adapter, client } = createAdapter();
    await adapter.loadSnapshot(MATCH_ID);
    const replay = await adapter.listEventsAfter(MATCH_ID, 1, 50);
    expect(replay.map((event) => event.type)).toEqual(["move.committed"]);
    expect(
      client.calls.find(
        (call) =>
          call.name === "get_chess_match_events_since" &&
          call.args.p_limit === 50,
      )?.args.p_after_revision,
    ).toBe(0);

    const command: MatchCommand = {
      type: "move",
      clientCommandId: CLIENT_COMMAND_ID,
      identity,
      expectedRevision: 1,
      uci: "e7e5",
      submittedClockMs: 299_000,
      createdAtClient: T2,
    };
    await expect(adapter.submitCommand(command)).resolves.toEqual({
      commandId: COMMAND_ID,
      clientCommandId: CLIENT_COMMAND_ID,
      commandSequence: 2,
      status: "pending",
      authoritativeRevision: 1,
    });
    expect(client.calls[client.calls.length - 1]).toEqual({
      name: "submit_chess_move_command",
      args: {
        p_match_id: MATCH_ID,
        p_expected_revision: 1,
        p_client_command_id: CLIENT_COMMAND_ID,
        p_uci: "e7e5",
        p_submitted_clock_ms: 299_000,
      },
    });
  });

  it("refreshes presence and delegates terminal actions to authoritative RPCs", async () => {
    const { adapter, client } = createAdapter();
    const heartbeat = await adapter.heartbeat(identity, 1);
    expect(heartbeat).toMatchObject({
      serverNow: T2,
      authoritativeRevision: 1,
      eventSequence: 2,
      participants: [
        { userId: WHITE_ID, connected: true },
        { userId: BLACK_ID, connected: false },
      ],
    });
    await expect(adapter.claimTimeout(identity, 1)).resolves.toEqual({
      finalized: true,
      result: "1-0",
      termination: "timeout",
      authoritativeRevision: 2,
      serverNow: T2,
    });
    await expect(adapter.resignMatch(identity, 1)).resolves.toEqual({
      finalized: true,
      result: "0-1",
      termination: "resignation",
      authoritativeRevision: 2,
      serverNow: T2,
    });
    expect(
      client.calls.filter((call) =>
        ["claim_chess_timeout", "resign_chess_match"].includes(call.name),
      ),
    ).toEqual([
      {
        name: "claim_chess_timeout",
        args: { p_match_id: MATCH_ID, p_expected_revision: 1 },
      },
      {
        name: "resign_chess_match",
        args: { p_match_id: MATCH_ID, p_expected_revision: 1 },
      },
    ]);
  });

  it("rejects malformed terminal receipts without projecting a result", async () => {
    const { adapter } = createAdapter(snapshotRow, eventRows, {
      resignMatch: [
        {
          finalized: true,
          result: "0-1",
          termination: "resignation",
          authoritative_revision: 99,
          server_now: T2,
        },
      ],
    });
    await adapter.loadSnapshot(MATCH_ID);
    await expect(adapter.resignMatch(identity, 1)).rejects.toThrow(
      /Révision de finalisation incompatible/,
    );
  });

  it("subscribes to inserts scoped to one match and maps the canonical row", async () => {
    const { adapter, client } = createAdapter();
    let subscription: MatchRealtimeSubscription | null = null;
    const received = new Promise<string>((resolve, reject) => {
      subscription = adapter.subscribe(identity, {
        onEvent: (event) => resolve(event.type),
        onStatus: (status, error) => {
          if (status === "error") reject(error);
        },
      });
      expect(client.realtimeChannel.changeFilter).toEqual({
        event: "INSERT",
        schema: "public",
        table: "chess_match_events",
        filter: `match_id=eq.${MATCH_ID}`,
      });
      client.realtimeChannel.emit(eventRows[1]);
    });

    await expect(received).resolves.toBe("move.committed");
    await subscription?.unsubscribe();
    expect(client.removed).toBe(true);
  });

  it("fails closed when a move advertises another ruleset hash", async () => {
    const { adapter, client } = createAdapter();
    const receivedError = new Promise<Error>((resolve) => {
      adapter.subscribe(identity, {
        onEvent: () => undefined,
        onStatus: (status, error) => {
          if (status === "error" && error) resolve(error);
        },
      });
      client.realtimeChannel.emit({
        ...eventRows[1],
        payload: { ...eventRows[1].payload, rulesetHash: "b".repeat(64) },
      });
    });

    const error = await receivedError;
    expect(error.message).toContain("incompatibles");
  });
});
