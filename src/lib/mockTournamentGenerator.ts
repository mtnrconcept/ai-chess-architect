import type {
  TournamentLeaderboardEntry,
  TournamentMatch,
  TournamentScore,
  TournamentStatus,
  TournamentSummary,
} from "@/models/Tournament";

const TOURNAMENT_DURATION_MS = 2 * 60 * 60 * 1000;
const DEFAULT_TOURNAMENT_COUNT = 8;

const rules = ["classic", "chess960", "king-of-the-hill", "three-check", "antichess"] as const;
const timeControls = ["bullet", "blitz", "longue"] as const;

const randomUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

const nowIso = () => new Date().toISOString();

const randomItem = <T,>(items: readonly T[]): T => {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
};

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const createBaseTournament = (reference: number): TournamentSummary => {
  const id = randomUUID();
  const rule = randomItem(rules);
  const timeControl = randomItem(timeControls);
  const offsetMinutes = randomInt(-120, 360); // Up to 2h in the future or 6h in the past.
  const start = reference + offsetMinutes * 60 * 1000;
  const end = start + TOURNAMENT_DURATION_MS;

  let status: TournamentStatus = "ongoing";
  if (reference < start) {
    status = "scheduled";
  } else if (reference >= end) {
    status = "completed";
  }

  return {
    id,
    name: `${timeControl === "bullet" ? "Bullet" : timeControl === "blitz" ? "Blitz" : "Parties longues"} ${rule.replace(/-/g, " ")}`
      .replace(/\b\w/g, char => char.toUpperCase()),
    rule,
    timeControl,
    status,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    matches: [],
    scores: {},
    leaderboard: [],
    totalPlayers: 0,
    totalMatches: 0,
  };
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

const simulateTournament = (tournament: TournamentSummary, reference: number) => {
  const participantCount = randomInt(6, 12);
  const participants: TournamentScore[] = Array.from({ length: participantCount }).map((_, index) => ({
    playerId: randomUUID(),
    playerName: `Joueur ${index + 1}`,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
  }));

  participants.forEach(player => {
    tournament.scores[player.playerId] = player;
  });

  if (tournament.status === "scheduled") {
    tournament.totalPlayers = participants.length;
    tournament.totalMatches = 0;
    tournament.leaderboard = [];
    return;
  }

  const matches: TournamentMatch[] = [];

  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      const player1 = participants[i];
      const player2 = participants[j];
      const roll = Math.random();

      let result: TournamentMatch["result"] = "draw";
      let winner: TournamentScore | null = null;
      let loser: TournamentScore | null = null;

      if (roll < 0.45) {
        result = "player1";
        winner = player1;
        loser = player2;
      } else if (roll > 0.55) {
        result = "player2";
        winner = player2;
        loser = player1;
      }

      if (result === "draw") {
        player1.draws += 1;
        player2.draws += 1;
        player1.points += 0.5;
        player2.points += 0.5;
      } else if (winner && loser) {
        winner.wins += 1;
        winner.points += 1;
        loser.losses += 1;
      }

      matches.push({
        id: randomUUID(),
        tournamentId: tournament.id,
        player1Id: player1.playerId,
        player2Id: player2.playerId,
        player1Name: player1.playerName,
        player2Name: player2.playerName,
        winnerId: result === "player1" ? player1.playerId : result === "player2" ? player2.playerId : null,
        result,
        completedAt: nowIso(),
      });
    }
  }

  tournament.matches = matches;
  tournament.leaderboard = computeLeaderboard(tournament.scores);
  tournament.totalPlayers = participants.length;
  tournament.totalMatches = matches.length;

  if (tournament.status === "ongoing") {
    const elapsedRatio = Math.min(
      1,
      (reference - new Date(tournament.startTime).getTime()) /
        (new Date(tournament.endTime).getTime() - new Date(tournament.startTime).getTime()),
    );
    // Drop a portion of the matches to simulate an in-progress event.
    const completedMatches = Math.max(1, Math.floor(matches.length * elapsedRatio));
    tournament.matches = matches.slice(0, completedMatches);
    tournament.totalMatches = tournament.matches.length;
  }
};

const generateMockTournaments = (count: number): Map<string, TournamentSummary> => {
  const reference = Date.now();
  const collection = new Map<string, TournamentSummary>();

  for (let i = 0; i < count; i += 1) {
    const tournament = createBaseTournament(reference);
    simulateTournament(tournament, reference);
    if (tournament.status !== "scheduled") {
      tournament.leaderboard = computeLeaderboard(tournament.scores);
    }
    tournament.totalPlayers = Object.keys(tournament.scores).length;
    tournament.totalMatches = tournament.matches.length;
    tournament.updatedAt = nowIso();
    collection.set(tournament.id, tournament);
  }

  return collection;
};

let mockTournaments: Map<string, TournamentSummary> | null = null;

const ensureMockTournaments = () => {
  if (!mockTournaments) {
    mockTournaments = generateMockTournaments(DEFAULT_TOURNAMENT_COUNT);
  }
  return mockTournaments;
};

export const listMockTournaments = (): TournamentSummary[] => {
  return Array.from(ensureMockTournaments().values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
};

export const reseedMockTournaments = (count = DEFAULT_TOURNAMENT_COUNT): TournamentSummary[] => {
  mockTournaments = generateMockTournaments(count);
  return listMockTournaments();
};

export const getMockTournamentLeaderboard = (id: string): TournamentLeaderboardEntry[] => {
  const tournament = ensureMockTournaments().get(id);
  return tournament ? tournament.leaderboard : [];
};
