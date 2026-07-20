import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn(() => ({ maybeSingle })));
const order = vi.hoisted(() => vi.fn(() => ({ limit, maybeSingle })));
const eq = vi.hoisted(() => vi.fn());
eq.mockImplementation(() => ({ eq, maybeSingle, order, limit }));
const select = vi.hoisted(() =>
  vi.fn(() => ({ eq, order, limit, maybeSingle })),
);
const from = vi.hoisted(() => vi.fn(() => ({ select })));

vi.mock("@/integrations/supabase/client", () => ({
  requireSupabaseClient: () => ({ rpc, from }),
}));

import {
  cancelChessMatchmaking,
  createChessRoomInvitation,
  createStandardChessRoom,
  enqueueStandardMatchmaking,
  getChessMatchByRoom,
  getChessLeaderboard,
  getChessRoom,
  getLatestChessMatchmakingTicket,
  getServerDailyPuzzle,
  getServerPlayerProgress,
  joinChessRoom,
  listOpenChessRooms,
  neutralPlayerLabel,
  submitServerDailyPuzzle,
} from "./platform-api";

const userId = "907500fe-e417-42d7-9d82-514e4ed9dd30";
const puzzleId = "c4000000-0000-4000-8000-000000000001";
const requestKey = "33000000-0000-4000-8000-000000000003";
const ticketId = "44000000-0000-4000-8000-000000000004";
const roomId = "55000000-0000-4000-8000-000000000005";
const matchId = "66000000-0000-4000-8000-000000000006";
const invitationId = "77000000-0000-4000-8000-000000000007";
const rulesetHash = "a".repeat(64);
const invitationToken = "b".repeat(64);

describe("chess platform API", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    select.mockClear();
    eq.mockClear();
    order.mockClear();
    limit.mockClear();
    maybeSingle.mockReset();
  });

  it("loads the real current-season leaderboard and validates totals", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          rank: 1,
          user_id: userId,
          rating: 1325,
          games_played: 4,
          wins: 2,
          draws: 1,
          losses: 1,
          provisional: true,
        },
      ],
      error: null,
    });

    await expect(getChessLeaderboard(50)).resolves.toEqual([
      {
        rank: 1,
        userId,
        rating: 1325,
        gamesPlayed: 4,
        wins: 2,
        draws: 1,
        losses: 1,
        provisional: true,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_chess_leaderboard", {
      p_season_id: null,
      p_limit: 50,
    });
    expect(neutralPlayerLabel(userId)).toBe("Joueur 9075-DD30");
  });

  it("rejects inconsistent leaderboard statistics", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          rank: 1,
          user_id: userId,
          rating: 1200,
          games_played: 3,
          wins: 3,
          draws: 1,
          losses: 0,
          provisional: false,
        },
      ],
      error: null,
    });

    await expect(getChessLeaderboard()).rejects.toThrow(/incohérentes/);
  });

  it("maps only the public daily puzzle projection without leaking a solution", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          available: true,
          puzzle_id: puzzleId,
          puzzle_date: "2026-07-20",
          title: "Le mat silencieux",
          fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
          themes: ["mateIn1"],
          rating: 800,
          attempt_status: null,
          attempt_count: 0,
          solution_moves: ["e2e4"],
        },
      ],
      error: null,
    });

    const puzzle = await getServerDailyPuzzle("2026-07-20");

    expect(rpc).toHaveBeenCalledWith("get_daily_chess_puzzle", {
      p_date: "2026-07-20",
    });
    expect(puzzle).toMatchObject({
      available: true,
      puzzleId,
      attemptStatus: null,
      attemptCount: 0,
    });
    expect(puzzle).not.toHaveProperty("solution_moves");
    expect(puzzle).not.toHaveProperty("solutionMoves");
  });

  it("submits candidate moves to the server for authoritative validation", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          solved: true,
          attempt_status: "solved",
          attempt_count: 1,
          xp_awarded: 30,
        },
      ],
      error: null,
    });

    await expect(
      submitServerDailyPuzzle(puzzleId, ["e2e4"], 2400),
    ).resolves.toEqual({
      solved: true,
      attemptStatus: "solved",
      attemptCount: 1,
      xpAwarded: 30,
    });
    expect(rpc).toHaveBeenCalledWith("submit_daily_chess_puzzle", {
      p_puzzle_id: puzzleId,
      p_moves: ["e2e4"],
      p_duration_ms: 2400,
    });
  });

  it("reads only the authenticated player's RLS progression row", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        total_xp: 130,
        level: 2,
        games_played: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        puzzles_solved: 1,
        current_streak: 1,
        best_streak: 1,
        last_activity_on: "2026-07-20",
      },
      error: null,
    });

    await expect(getServerPlayerProgress(userId)).resolves.toMatchObject({
      totalXp: 130,
      level: 2,
      puzzlesSolved: 1,
    });
    expect(from).toHaveBeenCalledWith("chess_player_progress");
    expect(eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("enqueues only standard unranked matchmaking and rejects untimed", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          ticket_id: ticketId,
          ticket_status: "queued",
          room_id: null,
          match_id: null,
        },
      ],
      error: null,
    });

    await expect(
      enqueueStandardMatchmaking({ requestKey, initialSeconds: 300 }),
    ).resolves.toEqual({
      ticketId,
      status: "queued",
      roomId: null,
      matchId: null,
    });
    expect(rpc).toHaveBeenCalledWith("enqueue_chess_matchmaking", {
      p_request_key: requestKey,
      p_rule_version_ids: [],
      p_rated: false,
      p_initial_seconds: 300,
      p_increment_seconds: 0,
      p_rating_window: 200,
    });

    rpc.mockClear();
    await expect(
      enqueueStandardMatchmaking({ requestKey, initialSeconds: 0 }),
    ).rejects.toThrow(/Cadence invalide/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("polls and cancels only the authenticated player's active queued ticket", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: ticketId,
        player_id: userId,
        request_key: requestKey,
        status: "queued",
        ruleset_type: "standard",
        rated: false,
        initial_seconds: 300,
        increment_seconds: 0,
        matched_room_id: null,
        matched_match_id: null,
        created_at: "2026-07-20T12:00:00Z",
        expires_at: "2099-07-20T12:10:00Z",
      },
      error: null,
    });

    await expect(
      getLatestChessMatchmakingTicket(userId),
    ).resolves.toMatchObject({
      ticketId,
      status: "queued",
      matchId: null,
    });
    expect(from).toHaveBeenCalledWith("chess_matchmaking_tickets");
    expect(eq).toHaveBeenCalledWith("player_id", userId);
    expect(eq).toHaveBeenCalledWith("status", "queued");

    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(cancelChessMatchmaking(ticketId)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("cancel_chess_matchmaking", {
      p_ticket_id: ticketId,
    });
  });

  it("does not restore a historical matched ticket", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: ticketId,
        player_id: userId,
        request_key: requestKey,
        status: "matched",
        ruleset_type: "standard",
        rated: false,
        initial_seconds: 300,
        increment_seconds: 0,
        matched_room_id: roomId,
        matched_match_id: matchId,
        created_at: "2026-07-20T12:00:00Z",
        expires_at: "2099-07-20T12:10:00Z",
      },
      error: null,
    });

    await expect(getLatestChessMatchmakingTicket(userId)).resolves.toBeNull();
    expect(eq).toHaveBeenCalledWith("status", "queued");
  });

  it("ignores a queued ticket whose server expiry is in the past", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: ticketId,
        player_id: userId,
        request_key: requestKey,
        status: "queued",
        ruleset_type: "standard",
        rated: false,
        initial_seconds: 300,
        increment_seconds: 0,
        matched_room_id: null,
        matched_match_id: null,
        created_at: "2020-07-20T12:00:00Z",
        expires_at: "2020-07-20T12:10:00Z",
      },
      error: null,
    });

    await expect(getLatestChessMatchmakingTicket(userId)).resolves.toBeNull();
  });

  it("lists, creates, invites and joins real standard rooms", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            room_id: roomId,
            room_name: "Salle publique",
            owner_id: userId,
            ruleset_type: "standard",
            ruleset_hash: rulesetHash,
            rated: false,
            initial_seconds: 300,
            increment_seconds: 0,
            waiting_since: "2026-07-20T12:00:00Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            room_id: roomId,
            ruleset_hash: rulesetHash,
            owner_color: "white",
            status: "open",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            invitation_id: invitationId,
            invitation_token: invitationToken,
            expires_at: "2026-07-21T12:00:00Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            room_id: roomId,
            match_id: matchId,
            assigned_color: "black",
            room_status: "in_game",
          },
        ],
        error: null,
      });

    await expect(listOpenChessRooms()).resolves.toHaveLength(1);
    await expect(
      createStandardChessRoom({
        name: "Salle publique",
        visibility: "public",
        requestKey,
        initialSeconds: 300,
      }),
    ).resolves.toMatchObject({ roomId, status: "open" });
    expect(rpc).toHaveBeenNthCalledWith(2, "create_chess_room", {
      p_name: "Salle publique",
      p_visibility: "public",
      p_request_key: requestKey,
      p_rule_version_ids: [],
      p_rated: false,
      p_initial_seconds: 300,
      p_increment_seconds: 0,
      p_owner_color: "random",
    });
    await expect(createChessRoomInvitation(roomId)).resolves.toMatchObject({
      invitationId,
      invitationToken,
    });
    await expect(joinChessRoom(roomId, invitationToken)).resolves.toMatchObject(
      {
        roomId,
        matchId,
        roomStatus: "in_game",
      },
    );
    expect(rpc).toHaveBeenLastCalledWith("join_chess_room", {
      p_room_id: roomId,
      p_invitation_token: invitationToken,
    });
  });

  it("reads the protected room and match rows without a simulation fallback", async () => {
    maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: roomId,
          owner_id: userId,
          name: "Salle réelle",
          visibility: "private",
          status: "in_game",
          ruleset_type: "standard",
          rated: false,
          initial_seconds: 300,
          increment_seconds: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: matchId,
          room_id: roomId,
          status: "active",
          started_at: "2026-07-20T12:05:00Z",
        },
        error: null,
      });

    await expect(getChessRoom(roomId)).resolves.toMatchObject({
      roomId,
      status: "in_game",
    });
    await expect(getChessMatchByRoom(roomId)).resolves.toMatchObject({
      matchId,
      status: "active",
    });
    expect(from).toHaveBeenCalledWith("chess_rooms");
    expect(from).toHaveBeenCalledWith("chess_matches");
  });
});
