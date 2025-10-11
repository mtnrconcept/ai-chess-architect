import crypto from "node:crypto";

import type {
  TimeControl,
  Tournament,
  TournamentLeaderboardEntry,
  TournamentMatch,
  TournamentScore,
  TournamentStatus,
  TournamentSummary,
} from "../models/Tournament";

const TOURNAMENT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

const rules = ["classic", "chess960", "king-of-the-hill", "three-check", "antichess"] as const;
const timeControls: TimeControl[] = ["bullet", "blitz", "longue"];

type SchedulerHandle = ReturnType<typeof setTimeout>;

const tournaments = new Map<string, Tournament>();
const completionTimers = new Map<string, SchedulerHandle>();

const nowIso = () => new Date().toISOString();

const randomItem = <T,>(items: readonly T[]): T => {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
};

const generateTournamentName = (rule: string, timeControl: TimeControl) => {
  const ruleLabel = rule.replace(/-/g, " ");
  const tcLabel =
    timeControl === "bullet" ? "Bullet" : timeControl === "blitz" ? "Blitz" : "Parties longues";
  return `${tcLabel} ${ruleLabel}`.replace(/\b\w/g, char => char.toUpperCase());
};

const computeLeaderboard = (scores: Record<string, TournamentScore>): TournamentLeaderboardEntry[] => {
  return Object.values(scores)
    .map(score => ({ ...score }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.draws !== a.draws) return b.draws - a.draws;
      return a.playerName.localeCompare(b.playerName);
    })
    .map((score, index) => ({ ...score, rank: index + 1 }));
};

const updateTournamentLeaderboard = (tournament: Tournament) => {
  tournament.leaderboard = computeLeaderboard(tournament.scores);
  tournament.updatedAt = nowIso();
};

const scheduleTournamentCompletion = (tournament: Tournament) => {
  const endTime = new Date(tournament.endTime).getTime();
  const delay = Math.max(0, endTime - Date.now());

  const existingTimer = completionTimers.get(tournament.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    completeTournament(tournament.id);
  }, delay);

  completionTimers.set(tournament.id, timer);
};

const createBaseTournament = (): Tournament => {
  const rule = randomItem(rules);
  const timeControl = randomItem(timeControls);
  const now = Date.now();
  const offsetMinutes = Math.floor(Math.random() * 240); // up to 4 hours in the past
  const start = now - offsetMinutes * 60 * 1000;
  const end = start + TOURNAMENT_DURATION_MS;
  const createdAt = nowIso();
  const id = crypto.randomUUID();
  const status: TournamentStatus = now >= end ? "completed" : "ongoing";

  return {
    id,
    name: generateTournamentName(rule, timeControl),
    rule,
    timeControl,
    status,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    createdAt,
    updatedAt: createdAt,
    matches: [],
    scores: {},
    leaderboard: [],
  };
};

const simulateInitialMatches = (tournament: Tournament) => {
  const playerCount = Math.floor(Math.random() * 5) + 4; // 4 to 8 players
  const players: TournamentScore[] = Array.from({ length: playerCount }).map((_, index) => ({
    playerId: crypto.randomUUID(),
    playerName: `Joueur ${index + 1}`,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
  }));

  players.forEach(player => {
    tournament.scores[player.playerId] = player;
  });

  // Simulate a small round-robin sample to make the leaderboard interesting.
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const player1 = players[i];
      const player2 = players[j];
      const outcome = Math.random();
      let result: TournamentMatch["result"] = "draw";
      let winner: TournamentScore | null = null;
      let loser: TournamentScore | null = null;

      if (outcome < 0.45) {
        result = "player1";
        winner = player1;
        loser = player2;
      } else if (outcome > 0.55) {
        result = "player2";
        winner = player2;
        loser = player1;
      }

      if (result === "draw") {
        player1.draws += 1;
        player2.draws += 1;
      } else if (winner && loser) {
        winner.wins += 1;
        loser.losses += 1;
        winner.points += 1;
      }

      const match: TournamentMatch = {
        id: crypto.randomUUID(),
        tournamentId: tournament.id,
        player1Id: player1.playerId,
        player2Id: player2.playerId,
        player1Name: player1.playerName,
        player2Name: player2.playerName,
        winnerId:
          result === "player1" ? player1.playerId : result === "player2" ? player2.playerId : null,
        result,
        completedAt: nowIso(),
      };

      tournament.matches.push(match);
    }
  }

  updateTournamentLeaderboard(tournament);
};

export const listTournaments = (): TournamentSummary[] => {
  return Array.from(tournaments.values())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map(tournament => ({
      ...tournament,
      totalPlayers: Object.keys(tournament.scores).length,
      totalMatches: tournament.matches.length,
    }));
};

export const getTournamentById = (id: string): TournamentSummary | undefined => {
  const tournament = tournaments.get(id);
  if (!tournament) {
    return undefined;
  }

  return {
    ...tournament,
    totalPlayers: Object.keys(tournament.scores).length,
    totalMatches: tournament.matches.length,
  };
};

export const seedTournaments = (count = 10) => {
  tournaments.clear();

  for (const timeout of completionTimers.values()) {
    clearTimeout(timeout);
  }
  completionTimers.clear();

  for (let i = 0; i < count; i += 1) {
    const tournament = createBaseTournament();
    simulateInitialMatches(tournament);
    tournaments.set(tournament.id, tournament);
    if (tournament.status === "completed") {
      completeTournament(tournament.id);
    } else {
      scheduleTournamentCompletion(tournament);
    }
  }

  return listTournaments();
};

export const completeTournament = (id: string): TournamentSummary | undefined => {
  const tournament = tournaments.get(id);
  if (!tournament) {
    return undefined;
  }

  tournament.status = "completed";
  updateTournamentLeaderboard(tournament);

  const timeout = completionTimers.get(id);
  if (timeout) {
    clearTimeout(timeout);
    completionTimers.delete(id);
  }

  return getTournamentById(id);
};

export const recordMatchResult = (
  id: string,
  options: {
    player1Id: string;
    player2Id: string;
    player1Name?: string;
    player2Name?: string;
    result: TournamentMatch["result"];
  },
) => {
  const tournament = tournaments.get(id);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (tournament.status === "completed") {
    throw new Error("Le tournoi est déjà terminé");
  }

  const ensurePlayer = (playerId: string, playerName?: string): TournamentScore => {
    const existing = tournament.scores[playerId];
    if (existing) {
      if (playerName && existing.playerName !== playerName) {
        existing.playerName = playerName;
      }
      return existing;
    }

    const created: TournamentScore = {
      playerId,
      playerName: playerName ?? `Joueur ${Object.keys(tournament.scores).length + 1}`,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
    };
    tournament.scores[playerId] = created;
    return created;
  };

  const player1 = ensurePlayer(options.player1Id, options.player1Name);
  const player2 = ensurePlayer(options.player2Id, options.player2Name);

  if (options.result === "draw") {
    player1.draws += 1;
    player2.draws += 1;
  } else if (options.result === "player1") {
    player1.wins += 1;
    player2.losses += 1;
    player1.points += 1;
  } else {
    player2.wins += 1;
    player1.losses += 1;
    player2.points += 1;
  }

  const match: TournamentMatch = {
    id: crypto.randomUUID(),
    tournamentId: id,
    player1Id: player1.playerId,
    player2Id: player2.playerId,
    player1Name: player1.playerName,
    player2Name: player2.playerName,
    winnerId:
      options.result === "player1"
        ? player1.playerId
        : options.result === "player2"
          ? player2.playerId
          : null,
    result: options.result,
    completedAt: nowIso(),
  };

  tournament.matches.push(match);
  tournament.updatedAt = nowIso();

  updateTournamentLeaderboard(tournament);

  return getTournamentById(id);
};

export const getTournamentLeaderboard = (id: string): TournamentLeaderboardEntry[] => {
  const tournament = tournaments.get(id);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  return computeLeaderboard(tournament.scores);
};

export const initializeTournaments = () => {
  if (tournaments.size === 0) {
    seedTournaments();
  } else {
    for (const tournament of tournaments.values()) {
      scheduleTournamentCompletion(tournament);
    }
  }
};

export const updateTournamentStatus = (id: string, status: TournamentStatus) => {
  const tournament = tournaments.get(id);
  if (!tournament) {
    throw new Error("Tournament not found");
  }

  tournament.status = status;
  tournament.updatedAt = nowIso();

  if (status === "completed") {
    completeTournament(id);
  } else if (status === "ongoing") {
    scheduleTournamentCompletion(tournament);
  }

  return getTournamentById(id);
};
