import { toUtcDateKey } from "./daily-puzzles";

export interface LocalPlayerProgress {
  xp: number;
  puzzlesSolved: number;
  currentStreak: number;
  bestStreak: number;
  lastPuzzleDate: string | null;
  completedPuzzleIds: string[];
}

export interface ProgressLevel {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  percentage: number;
}

export const PLAY_HUB_PROGRESS_STORAGE_KEY = "voltus.play-hub.progress.v1";
export const PUZZLE_XP_REWARD = 40;

export const EMPTY_PLAYER_PROGRESS: LocalPlayerProgress = Object.freeze({
  xp: 0,
  puzzlesSolved: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastPuzzleDate: null,
  completedPuzzleIds: [],
});

const isDateKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const nonNegativeInteger = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

export function parseStoredProgress(value: string | null): LocalPlayerProgress {
  if (!value) return { ...EMPTY_PLAYER_PROGRESS };

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      xp: nonNegativeInteger(parsed.xp),
      puzzlesSolved: nonNegativeInteger(parsed.puzzlesSolved),
      currentStreak: nonNegativeInteger(parsed.currentStreak),
      bestStreak: nonNegativeInteger(parsed.bestStreak),
      lastPuzzleDate: isDateKey(parsed.lastPuzzleDate)
        ? parsed.lastPuzzleDate
        : null,
      completedPuzzleIds: Array.isArray(parsed.completedPuzzleIds)
        ? [
            ...new Set(
              parsed.completedPuzzleIds.filter(
                (id): id is string => typeof id === "string",
              ),
            ),
          ]
        : [],
    };
  } catch {
    return { ...EMPTY_PLAYER_PROGRESS };
  }
}

export function calculateProgressLevel(xp: number): ProgressLevel {
  const safeXp = Math.max(0, Math.floor(xp));
  const levelSize = 250;
  const level = Math.floor(safeXp / levelSize) + 1;
  const currentLevelXp = safeXp % levelSize;

  return {
    level,
    currentLevelXp,
    nextLevelXp: levelSize,
    percentage: Math.round((currentLevelXp / levelSize) * 100),
  };
}

export function calculateServerProgressLevel(
  xp: number,
  reportedLevel: number,
): ProgressLevel {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = Math.max(1, Math.floor(reportedLevel));
  const currentThreshold = 100 * (level - 1) ** 2;
  const nextThreshold = 100 * level ** 2;
  const levelSpan = Math.max(1, nextThreshold - currentThreshold);
  const currentLevelXp = Math.min(
    levelSpan,
    Math.max(0, safeXp - currentThreshold),
  );

  return {
    level,
    currentLevelXp,
    nextLevelXp: levelSpan,
    percentage: Math.min(
      100,
      Math.max(0, Math.round((currentLevelXp / levelSpan) * 100)),
    ),
  };
}

const previousUtcDateKey = (dateKey: string): string => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return toUtcDateKey(date);
};

export function awardPuzzleCompletion(
  progress: LocalPlayerProgress,
  puzzleId: string,
  completedAt: Date = new Date(),
): { progress: LocalPlayerProgress; rewarded: boolean } {
  if (progress.completedPuzzleIds.includes(puzzleId)) {
    return { progress, rewarded: false };
  }

  const dateKey = toUtcDateKey(completedAt);
  const continuesStreak =
    progress.lastPuzzleDate === previousUtcDateKey(dateKey);
  const sameDay = progress.lastPuzzleDate === dateKey;
  const currentStreak = sameDay
    ? Math.max(1, progress.currentStreak)
    : continuesStreak
      ? progress.currentStreak + 1
      : 1;

  return {
    rewarded: true,
    progress: {
      xp: progress.xp + PUZZLE_XP_REWARD,
      puzzlesSolved: progress.puzzlesSolved + 1,
      currentStreak,
      bestStreak: Math.max(progress.bestStreak, currentStreak),
      lastPuzzleDate: dateKey,
      completedPuzzleIds: [...progress.completedPuzzleIds, puzzleId],
    },
  };
}

export function readLocalProgress(): LocalPlayerProgress {
  if (typeof window === "undefined") return { ...EMPTY_PLAYER_PROGRESS };
  try {
    return parseStoredProgress(
      window.localStorage.getItem(PLAY_HUB_PROGRESS_STORAGE_KEY),
    );
  } catch {
    return { ...EMPTY_PLAYER_PROGRESS };
  }
}

export function writeLocalProgress(progress: LocalPlayerProgress): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      PLAY_HUB_PROGRESS_STORAGE_KEY,
      JSON.stringify(progress),
    );
    return true;
  } catch {
    return false;
  }
}
