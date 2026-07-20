import { describe, expect, it } from "vitest";
import type { DerivedClock } from "../clock";
import { canClaimDisplayedTimeout } from "../terminal-actions";

const clock = (
  activeSide: "white" | "black",
  timedOutSide: "white" | "black" | null,
): DerivedClock => ({
  whiteRemainingMs:
    activeSide === "white" && timedOutSide === "white" ? 0 : 10_000,
  blackRemainingMs:
    activeSide === "black" && timedOutSide === "black" ? 0 : 10_000,
  activeSide,
  timedOutSide,
  evaluatedAtServerMs: Date.parse("2026-07-20T12:00:00.000Z"),
});

describe("timeout claim visibility", () => {
  it("shows only to the opponent of the expired active side", () => {
    expect(
      canClaimDisplayedTimeout({
        phase: "playing",
        playerSide: "black",
        clock: clock("white", "white"),
      }),
    ).toBe(true);
    expect(
      canClaimDisplayedTimeout({
        phase: "playing",
        playerSide: "white",
        clock: clock("white", "white"),
      }),
    ).toBe(false);
  });

  it("stays hidden before zero, while paused, and without player identity", () => {
    expect(
      canClaimDisplayedTimeout({
        phase: "playing",
        playerSide: "black",
        clock: clock("white", null),
      }),
    ).toBe(false);
    expect(
      canClaimDisplayedTimeout({
        phase: "paused",
        playerSide: "black",
        clock: clock("white", "white"),
      }),
    ).toBe(false);
    expect(
      canClaimDisplayedTimeout({
        phase: "playing",
        playerSide: null,
        clock: clock("white", "white"),
      }),
    ).toBe(false);
  });
});
