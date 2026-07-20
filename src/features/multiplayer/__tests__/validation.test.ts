import { describe, expect, it } from "vitest";
import { parsePersistedMatchEvent } from "../validation";
import { HASH, LOBBY_ID, MATCH_ID, T0 } from "./fixtures";

const row = {
  event_id: "server-event-1",
  client_event_id: "client-event-1",
  sequence: 1,
  revision: 0,
  match_id: MATCH_ID,
  lobby_id: LOBBY_ID,
  ruleset_hash: HASH,
  match_seed: "1948897573444275",
  engine_version: "2.0.0",
  actor_id: "player-white",
  event_type: "match.waiting",
  event_payload: {
    participants: [],
    clock: null,
  },
  occurred_at: T0,
};

describe("multiplayer wire validation", () => {
  it("parses the centralized snake_case Supabase contract", () => {
    expect(parsePersistedMatchEvent(row)).toMatchObject({
      eventId: "server-event-1",
      sequence: 1,
      revision: 0,
      identity: {
        matchId: MATCH_ID,
        lobbyId: LOBBY_ID,
        rulesetHash: HASH,
        matchSeed: "1948897573444275",
      },
      type: "match.waiting",
    });
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      parsePersistedMatchEvent({ ...row, event_type: "javascript.execute" }),
    ).toThrow("inconnu");
  });

  it("rejects malformed move coordinates before projection", () => {
    expect(() =>
      parsePersistedMatchEvent({
        ...row,
        event_type: "move.committed",
        event_payload: {
          move: {
            ply: 1,
            side: "white",
            from: "z9",
            to: "e4",
            uci: "e2e4",
            positionHash: "position-1",
          },
          next_side: "black",
          clock: {
            white_remaining_ms: 300_000,
            black_remaining_ms: 300_000,
            active_side: "black",
            turn_started_at: T0,
            paused_at: null,
            server_now: T0,
          },
        },
      }),
    ).toThrow("coordonnées");
  });
});
