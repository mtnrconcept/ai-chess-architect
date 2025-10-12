import type { Tables } from "@/integrations/supabase/types";

export type TournamentOverview = Tables<"tournament_overview">;
export type Tournament = Tables<"tournaments">;
export type TournamentRegistration = Tables<"tournament_registrations">;
export type TournamentMatch = Tables<"tournament_matches"> & {
  is_ai_match?: boolean | null;
  ai_opponent_label?: string | null;
  ai_opponent_difficulty?: string | null;
  lobby?: {
    id: string;
    name: string;
    status: string;
    mode?: "ai" | "player" | null;
    opponent_name?: string | null;
    opponent_id?: string | null;
  } | null;
};

export interface TournamentDetails {
  overview: TournamentOverview;
  registrations: TournamentRegistrationWithMatch[];
  matches: TournamentMatch[];
}

export type TournamentRegistrationWithMatch = TournamentRegistration & {
  current_match?: TournamentMatch | null;
};

export interface MatchmakingResponse {
  match: TournamentMatch | null;
  registration: TournamentRegistration | null;
}

export interface TournamentLeaderboardEntry {
  user_id: string;
  display_name: string | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}
