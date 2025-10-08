import type { Tables } from "@/integrations/supabase/types";

export type TournamentOverview = Tables<"tournament_overview">;
export type Tournament = Tables<"tournaments">;
export type TournamentRegistration = Tables<"tournament_registrations">;
export type TournamentMatch = Tables<"tournament_matches"> & {
  lobby?: {
    id: string;
    name: string;
    status: string;
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
