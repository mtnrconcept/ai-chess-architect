import { describe, expect, it } from "vitest";

import {
  EMPTY_PLAYER_PROGRESS,
  PUZZLE_XP_REWARD,
  awardPuzzleCompletion,
  calculateProgressLevel,
  calculateServerProgressLevel,
  parseStoredProgress,
} from "./progression";

describe("local play hub progression", () => {
  it("awards a puzzle once and prevents duplicate XP", () => {
    const first = awardPuzzleCompletion(
      { ...EMPTY_PLAYER_PROGRESS },
      "daily-one",
      new Date("2026-07-20T12:00:00.000Z"),
    );
    const duplicate = awardPuzzleCompletion(
      first.progress,
      "daily-one",
      new Date("2026-07-20T13:00:00.000Z"),
    );

    expect(first.rewarded).toBe(true);
    expect(first.progress.xp).toBe(PUZZLE_XP_REWARD);
    expect(duplicate.rewarded).toBe(false);
    expect(duplicate.progress.xp).toBe(PUZZLE_XP_REWARD);
  });

  it("continues a streak only on consecutive UTC days", () => {
    const dayOne = awardPuzzleCompletion(
      { ...EMPTY_PLAYER_PROGRESS },
      "one",
      new Date("2026-07-19T23:00:00.000Z"),
    ).progress;
    const dayTwo = awardPuzzleCompletion(
      dayOne,
      "two",
      new Date("2026-07-20T08:00:00.000Z"),
    ).progress;
    const afterGap = awardPuzzleCompletion(
      dayTwo,
      "three",
      new Date("2026-07-23T08:00:00.000Z"),
    ).progress;

    expect(dayTwo.currentStreak).toBe(2);
    expect(afterGap.currentStreak).toBe(1);
    expect(afterGap.bestStreak).toBe(2);
  });

  it("sanitizes corrupted stored data", () => {
    expect(parseStoredProgress("not-json")).toEqual(EMPTY_PLAYER_PROGRESS);
    expect(
      parseStoredProgress(
        JSON.stringify({
          xp: -20,
          puzzlesSolved: 2,
          currentStreak: "invalid",
          completedPuzzleIds: ["one", "one", 7],
        }),
      ),
    ).toMatchObject({
      xp: 0,
      puzzlesSolved: 2,
      currentStreak: 0,
      completedPuzzleIds: ["one"],
    });
  });

  it("calculates bounded level progress", () => {
    expect(calculateProgressLevel(290)).toEqual({
      level: 2,
      currentLevelXp: 40,
      nextLevelXp: 250,
      percentage: 16,
    });
  });

  it("uses the server quadratic level thresholds without inventing a level", () => {
    expect(calculateServerProgressLevel(130, 2)).toEqual({
      level: 2,
      currentLevelXp: 30,
      nextLevelXp: 300,
      percentage: 10,
    });
  });
});
