export type TimeControl = "bullet" | "blitz" | "longue";

export type TournamentStatus = "scheduled" | "ongoing" | "completed";

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
  player1Name?: string;
  player2Name?: string;
  winnerId: string | null;
  result: "player1" | "player2" | "draw";
  completedAt: string;
}

export interface TournamentScore {
  playerId: string;
  playerName: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

export interface TournamentLeaderboardEntry extends TournamentScore {
  rank: number;
}

export interface Tournament {
  id: string;
  name: string;
  rule: string;
  timeControl: TimeControl;
  status: TournamentStatus;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
  matches: TournamentMatch[];
  scores: Record<string, TournamentScore>;
  leaderboard: TournamentLeaderboardEntry[];
}

export interface TournamentSummary extends Tournament {
  totalPlayers: number;
  totalMatches: number;
}
