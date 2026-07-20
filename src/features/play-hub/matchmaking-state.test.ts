import { describe, expect, it } from "vitest";

import type { ChessMatchmakingResult } from "./platform-api";
import { resolveActiveMatchmakingTicket } from "./matchmaking-state";

const pending: ChessMatchmakingResult = {
  ticketId: "44000000-0000-4000-8000-000000000004",
  status: "queued",
  roomId: null,
  matchId: null,
};

describe("QuickPlay matchmaking state", () => {
  it("uses an optimistic ticket only before the first server response", () => {
    expect(
      resolveActiveMatchmakingTicket({
        hasServerResponse: false,
        serverTicket: undefined,
        pendingResult: pending,
      }),
    ).toBe(pending);
  });

  it("lets a successful null server response clear the optimistic ticket", () => {
    expect(
      resolveActiveMatchmakingTicket({
        hasServerResponse: true,
        serverTicket: null,
        pendingResult: pending,
      }),
    ).toBeNull();
  });

  it("never restores a historical matched ticket", () => {
    expect(
      resolveActiveMatchmakingTicket({
        hasServerResponse: true,
        serverTicket: {
          ...pending,
          playerId: "907500fe-e417-42d7-9d82-514e4ed9dd30",
          requestKey: "33000000-0000-4000-8000-000000000003",
          rulesetType: "standard",
          rated: false,
          initialSeconds: 300,
          incrementSeconds: 0,
          createdAt: "2026-07-20T12:00:00Z",
          expiresAt: "2026-07-20T12:10:00Z",
          status: "matched",
          roomId: "55000000-0000-4000-8000-000000000005",
          matchId: "66000000-0000-4000-8000-000000000006",
        },
        pendingResult: null,
      }),
    ).toBeNull();
  });
});
