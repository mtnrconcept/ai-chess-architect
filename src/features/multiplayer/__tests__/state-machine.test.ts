import { describe, expect, it } from "vitest";
import {
  createInitialMatchState,
  hydrateMatchState,
  MatchStateTransitionError,
  reduceMatchEvent,
} from "../state-machine";
import {
  asAnyEvent,
  clock,
  event,
  identity,
  move,
  participants,
  T0,
} from "./fixtures";

const startedState = () => {
  let state = createInitialMatchState(identity);
  state = reduceMatchEvent(
    state,
    asAnyEvent(event(1, "match.waiting", { participants, clock: null })),
  );
  return reduceMatchEvent(
    state,
    asAnyEvent(
      event(2, "match.started", {
        participants,
        currentSide: "white",
        clock: clock(),
        initialPositionHash: "initial",
      }),
    ),
  );
};

describe("multiplayer state machine", () => {
  it("projects persisted moves and supports an authoritative extra turn", () => {
    let state = startedState();
    state = reduceMatchEvent(
      state,
      asAnyEvent(
        event(3, "move.committed", {
          move: move(1, "white", "e2", "e4"),
          nextSide: "white",
          clock: clock("white", { whiteRemainingMs: 298_000 }),
        }),
      ),
    );
    state = reduceMatchEvent(
      state,
      asAnyEvent(
        event(4, "move.committed", {
          move: move(2, "white", "d2", "d4"),
          nextSide: "black",
          clock: clock("black", { whiteRemainingMs: 296_000 }),
        }),
      ),
    );
    expect(state.moves.map((item) => item.uci)).toEqual(["e2e4", "d2d4"]);
    expect(state.currentSide).toBe("black");
    expect(state.lastSequence).toBe(4);
  });

  it("rejects a move from the wrong side or with a skipped ply", () => {
    const state = startedState();
    expect(() =>
      reduceMatchEvent(
        state,
        asAnyEvent(
          event(3, "move.committed", {
            move: move(2, "black", "e7", "e5"),
            nextSide: "white",
            clock: clock("white"),
          }),
        ),
      ),
    ).toThrow(MatchStateTransitionError);
  });

  it("hydrates a server snapshot and preserves its cursor", () => {
    const state = hydrateMatchState(identity, {
      identity,
      sequence: 12,
      revision: 11,
      phase: "paused",
      currentSide: "black",
      moves: [move(1, "white", "e2", "e4")],
      clock: clock(null, { pausedAt: T0 }),
      participants,
      result: null,
      capturedAt: T0,
    });
    expect(state.phase).toBe("paused");
    expect(state.lastSequence).toBe(12);
    expect(state.moves).toHaveLength(1);
  });

  it("accepts only server-persisted terminal transitions", () => {
    const state = reduceMatchEvent(
      startedState(),
      asAnyEvent(
        event(3, "match.finished", {
          result: { winner: "white", reason: "checkmate" },
          clock: clock(null),
          finalPositionHash: "final",
        }),
      ),
    );
    expect(state.phase).toBe("finished");
    expect(state.result).toEqual({ winner: "white", reason: "checkmate" });
  });
});
