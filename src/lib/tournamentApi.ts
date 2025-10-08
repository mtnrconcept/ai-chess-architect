import { supabase } from "@/integrations/supabase/client";
import type {
  MatchmakingResponse,
  TournamentDetails,
  TournamentLeaderboardEntry,
  TournamentOverview,
  TournamentRegistrationWithMatch,
  TournamentMatch,
} from "@/types/tournament";

export const syncTournaments = async () => {
  const { error } = await supabase.functions.invoke("sync-tournaments", { body: {} });
  if (error) {
    throw new Error(error.message ?? "Impossible de synchroniser les tournois");
  }
};

export const fetchTournamentOverview = async (): Promise<TournamentOverview[]> => {
  const { data, error } = await supabase
    .from("tournament_overview")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};

export const fetchTournamentDetails = async (tournamentId: string): Promise<TournamentDetails> => {
  const [{ data: overviewData, error: overviewError }] = await Promise.all([
    supabase
      .from("tournament_overview")
      .select("*")
      .eq("id", tournamentId)
      .single(),
  ]);

  if (overviewError || !overviewData) {
    throw new Error(overviewError?.message ?? "Tournoi introuvable");
  }

  const { data: registrations, error: registrationsError } = await supabase
    .from("tournament_registrations")
    .select("*, current_match:tournament_matches(*, lobby:lobbies(id, name, status, opponent_name, opponent_id))")
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("draws", { ascending: false });

  if (registrationsError) {
    throw new Error(registrationsError.message);
  }

  const { data: matches, error: matchesError } = await supabase
    .from("tournament_matches")
    .select("*, lobby:lobbies(id, name, status, opponent_name, opponent_id)")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false });

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  return {
    overview: overviewData,
    registrations: (registrations ?? []) as TournamentRegistrationWithMatch[],
    matches: (matches ?? []) as TournamentMatch[],
  };
};

export const fetchUserTournamentRegistrations = async (userId: string): Promise<TournamentRegistrationWithMatch[]> => {
  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("*, current_match:tournament_matches(*, lobby:lobbies(id, name, status, opponent_name, opponent_id))")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TournamentRegistrationWithMatch[];
};

export const registerForTournament = async (
  tournamentId: string,
  userId: string,
  displayName: string,
  avatarUrl: string | null,
) => {
  const payload = {
    tournament_id: tournamentId,
    user_id: userId,
    display_name: displayName,
    avatar_url: avatarUrl,
    last_active_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("tournament_registrations")
    .upsert(payload, { onConflict: "tournament_id,user_id" });

  if (error) {
    throw new Error(error.message);
  }
};

export const requestTournamentMatch = async (
  tournamentId: string,
  displayName?: string,
): Promise<MatchmakingResponse> => {
  const { data, error } = await supabase.functions.invoke<MatchmakingResponse>(
    "tournament-matchmaking",
    { body: { tournamentId, displayName } },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data ?? { match: null, registration: null };
};

export const reportTournamentMatch = async (
  matchId: string,
  result: "player1" | "player2" | "draw",
) => {
  const { data, error } = await supabase.functions.invoke<{
    match: TournamentMatch;
    leaderboard: TournamentLeaderboardEntry[];
  }>("report-tournament-match", { body: { matchId, result } });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const fetchTournamentLeaderboard = async (
  tournamentId: string,
): Promise<TournamentLeaderboardEntry[]> => {
  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("user_id, display_name, wins, losses, draws, points")
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("draws", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
};
