import { supabase, supabaseEnvProblems } from "@/integrations/supabase/client";
import type { PostgrestError } from "@supabase/supabase-js";
import type {
  MatchmakingResponse,
  TournamentDetails,
  TournamentLeaderboardEntry,
  TournamentOverview,
  TournamentRegistrationWithMatch,
  TournamentMatch,
} from "@/types/tournament";

const ACTIVE_MATCH_STATUSES = new Set(["pending", "in_progress"]);

export class TournamentFeatureUnavailableError extends Error {
  constructor(message = "Les tournois ne sont pas disponibles : configurez Supabase pour activer cette fonctionnalité.") {
    super(message);
    this.name = "TournamentFeatureUnavailableError";
  }
}

const requireTournamentSupabase = () => {
  if (!supabase) {
    const details = supabaseEnvProblems.length > 0 ? ` Détails : ${supabaseEnvProblems.join(" | ")}.` : "";
    throw new TournamentFeatureUnavailableError(
      `Supabase n'est pas configuré pour les tournois.${details || " Configurez vos variables d'environnement Supabase."}`,
    );
  }

  return supabase;
};

type ErrorWithStatus = {
  status?: number | string | null;
};

const extractStatusCode = (error: ErrorWithStatus | null | undefined) => {
  if (!error) {
    return undefined;
  }

  const { status } = error;

  if (typeof status === "number" && Number.isFinite(status)) {
    return status;
  }

  if (typeof status === "string") {
    const parsed = Number.parseInt(status, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const normaliseErrorCode = (code: unknown) => {
  if (typeof code !== "string") {
    return "";
  }

  return code.trim().toUpperCase();
};

const MISSING_RELATION_ERROR_CODES = new Set([
  "42P01",
  "PGRST205",
  "PGRST302",
  "PGRST404",
  "404",
]);

const isOverviewViewMissing = (error: PostgrestError | null) => {
  if (!error) {
    return false;
  }

  const status = extractStatusCode(error as ErrorWithStatus);
  if (status === 404) {
    return true;
  }

  const code = normaliseErrorCode(error.code);
  if (code && (code === "42P01" || code === "PGRST404" || code === "404")) {
    return true;
  }

  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("tournament_overview");
};

const isRelationMissing = (error: PostgrestError | null) => {
  if (!error) {
    return false;
  }

  const status = extractStatusCode(error as ErrorWithStatus);
  if (status === 404) {
    return true;
  }

  const code = normaliseErrorCode(error.code);
  if (code && MISSING_RELATION_ERROR_CODES.has(code)) {
    return true;
  }

  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";

  if (!message && !details) {
    return false;
  }

  const haystack = `${message} ${details}`;
  return (
    haystack.includes("does not exist") ||
    haystack.includes("not exist") ||
    haystack.includes("not found") ||
    haystack.includes("schema cache")
  );
};

const isFunctionUnavailable = (error: { message?: string | null; code?: string | null } & ErrorWithStatus) => {
  if (!error) {
    return false;
  }

  const status = extractStatusCode(error);
  if (status === 404 || status === 503) {
    return true;
  }

  const code = normaliseErrorCode(error.code);
  if (code && (code === "FEATURE_UNAVAILABLE" || MISSING_RELATION_ERROR_CODES.has(code))) {
    return true;
  }

  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("not found") ||
    message.includes("not exist") ||
    message.includes("schema cache") ||
    message.includes("unavailable") ||
    message.includes("failed to send a request") ||
    message.includes("edge function")
  );
};

const fetchTournamentOverviewFromBaseTables = async (tournamentId?: string): Promise<TournamentOverview[]> => {
  const supabaseClient = requireTournamentSupabase();

  const tournamentsQuery = supabaseClient.from("tournaments").select("*").order("start_time", { ascending: true });

  if (tournamentId) {
    tournamentsQuery.eq("id", tournamentId);
  }

  const { data: tournaments, error: tournamentsError } = await tournamentsQuery;

  if (tournamentsError) {
    if (isRelationMissing(tournamentsError)) {
      throw new TournamentFeatureUnavailableError(
        "Les tables Supabase nécessaires aux tournois ne sont pas disponibles. Exécutez les migrations pour les créer.",
      );
    }
    throw new Error(tournamentsError.message);
  }

  const tournamentList = tournaments ?? [];

  if (tournamentList.length === 0) {
    return [];
  }

  const tournamentIds = tournamentList
    .map(tournament => tournament.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const registrationCounts = new Map<string, number>();
  const matchCounts = new Map<string, { active: number; completed: number }>();

  if (tournamentIds.length > 0) {
    const { data: registrations, error: registrationsError } = await supabaseClient
      .from("tournament_registrations")
      .select("tournament_id")
      .in("tournament_id", tournamentIds);

    if (registrationsError) {
      if (isRelationMissing(registrationsError)) {
        throw new TournamentFeatureUnavailableError(
          "Les inscriptions de tournois ne sont pas disponibles. Vérifiez la configuration Supabase.",
        );
      }
      throw new Error(registrationsError.message);
    }

    (registrations ?? []).forEach(registration => {
      const id = registration.tournament_id;
      if (!id) return;
      registrationCounts.set(id, (registrationCounts.get(id) ?? 0) + 1);
    });

    const { data: matches, error: matchesError } = await supabaseClient
      .from("tournament_matches")
      .select("tournament_id, status")
      .in("tournament_id", tournamentIds);

    if (matchesError) {
      if (isRelationMissing(matchesError)) {
        throw new TournamentFeatureUnavailableError(
          "Les matches de tournois ne sont pas disponibles. Vérifiez la configuration Supabase.",
        );
      }
      throw new Error(matchesError.message);
    }

    (matches ?? []).forEach(match => {
      const id = match.tournament_id;
      if (!id) return;
      const counts = matchCounts.get(id) ?? { active: 0, completed: 0 };
      if (match.status === "completed") {
        counts.completed += 1;
      } else if (match.status && ACTIVE_MATCH_STATUSES.has(match.status)) {
        counts.active += 1;
      }
      matchCounts.set(id, counts);
    });
  }

  return tournamentList.map(tournament => ({
    ...tournament,
    player_count: registrationCounts.get(tournament.id) ?? 0,
    active_match_count: matchCounts.get(tournament.id)?.active ?? 0,
    completed_match_count: matchCounts.get(tournament.id)?.completed ?? 0,
  })) as TournamentOverview[];
};

const fetchSingleTournamentOverview = async (tournamentId: string): Promise<TournamentOverview> => {
  const supabaseClient = requireTournamentSupabase();

  try {
    const { data, error } = await supabaseClient
      .from("tournament_overview")
      .select("*")
      .eq("id", tournamentId)
      .maybeSingle();

    if (data) {
      return data;
    }

    if (isOverviewViewMissing(error)) {
      const fallback = await fetchTournamentOverviewFromBaseTables(tournamentId);
      const overview = fallback[0];
      if (overview) {
        return overview;
      }
    }

    if (error) {
      if (isRelationMissing(error)) {
        throw new TournamentFeatureUnavailableError();
      }
      if (error.code === "PGRST116") {
        throw new Error("Tournoi introuvable");
      }
      throw new Error(error.message);
    }
  } catch (unknownError) {
    if (unknownError instanceof TournamentFeatureUnavailableError) {
      throw unknownError;
    }
    if (unknownError instanceof Error) {
      throw unknownError;
    }
  }

  throw new Error("Tournoi introuvable");
};

export const syncTournaments = async () => {
  const supabaseClient = requireTournamentSupabase();

  try {
    const { error } = await supabaseClient.functions.invoke("sync-tournaments", { body: {} });
    if (error) {
      if (isFunctionUnavailable(error)) {
        throw new TournamentFeatureUnavailableError(
          "La synchronisation des tournois n'est pas disponible. Vérifiez le déploiement de l'edge function 'sync-tournaments' et appliquez les migrations Supabase associées.",
        );
      }

      const message = typeof error.message === "string" ? error.message : "";
      throw new Error(message || "Impossible de synchroniser les tournois");
    }
  } catch (unknownError) {
    if (unknownError instanceof TypeError && unknownError.message.toLowerCase().includes("fetch")) {
      throw new TournamentFeatureUnavailableError(
        "La fonction 'sync-tournaments' n'est pas accessible (CORS/404). Déployez l'edge function correspondante sur Supabase.",
      );
    }

    if (unknownError instanceof TournamentFeatureUnavailableError) {
      throw unknownError;
    }

    if (unknownError instanceof Error) {
      throw unknownError;
    }

    throw new Error("Impossible de synchroniser les tournois");
  }
};

export const fetchTournamentOverview = async (): Promise<TournamentOverview[]> => {
  const supabaseClient = requireTournamentSupabase();

  try {
    const { data, error } = await supabaseClient
      .from("tournament_overview")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      if (isOverviewViewMissing(error)) {
        return fetchTournamentOverviewFromBaseTables();
      }
      if (isRelationMissing(error)) {
        throw new TournamentFeatureUnavailableError();
      }
      throw new Error(error.message);
    }

    return data ?? [];
  } catch (unknownError) {
    if (unknownError instanceof TournamentFeatureUnavailableError) {
      throw unknownError;
    }
    if (unknownError instanceof Error) {
      throw unknownError;
    }
    throw new Error("Impossible de récupérer les tournois");
  }
};

export const fetchTournamentDetails = async (tournamentId: string): Promise<TournamentDetails> => {
  const supabaseClient = requireTournamentSupabase();
  const overviewData = await fetchSingleTournamentOverview(tournamentId);

  const { data: registrations, error: registrationsError } = await supabaseClient
    .from("tournament_registrations")
    .select("*, current_match:tournament_matches(*, lobby:lobbies(id, name, status, mode, opponent_name, opponent_id))")
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("draws", { ascending: false });

  if (registrationsError) {
    if (isRelationMissing(registrationsError)) {
      throw new TournamentFeatureUnavailableError();
    }
    throw new Error(registrationsError.message);
  }

  const { data: matches, error: matchesError } = await supabaseClient
    .from("tournament_matches")
    .select("*, lobby:lobbies(id, name, status, mode, opponent_name, opponent_id)")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false });

  if (matchesError) {
    if (isRelationMissing(matchesError)) {
      throw new TournamentFeatureUnavailableError();
    }
    throw new Error(matchesError.message);
  }

  return {
    overview: overviewData,
    registrations: (registrations ?? []) as unknown as TournamentRegistrationWithMatch[],
    matches: (matches ?? []) as unknown as TournamentMatch[],
  };
};

export const fetchUserTournamentRegistrations = async (userId: string): Promise<TournamentRegistrationWithMatch[]> => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } = await supabaseClient
    .from("tournament_registrations")
    .select("*, current_match:tournament_matches(*, lobby:lobbies(id, name, status, mode, opponent_name, opponent_id))")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    if (isRelationMissing(error)) {
      throw new TournamentFeatureUnavailableError();
    }
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as TournamentRegistrationWithMatch[];
};

export const registerForTournament = async (
  tournamentId: string,
  userId: string,
  displayName: string,
  avatarUrl: string | null,
) => {
  const supabaseClient = requireTournamentSupabase();
  const payload = {
    tournament_id: tournamentId,
    user_id: userId,
    display_name: displayName,
    avatar_url: avatarUrl,
    last_active_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from("tournament_registrations")
    .upsert(payload, { onConflict: "tournament_id,user_id" });

  if (error) {
    if (isRelationMissing(error)) {
      throw new TournamentFeatureUnavailableError();
    }
    throw new Error(error.message);
  }
};

export const requestTournamentMatch = async (
  tournamentId: string,
  displayName?: string,
): Promise<MatchmakingResponse> => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } = await supabaseClient.functions.invoke<MatchmakingResponse>(
    "tournament-matchmaking",
    { body: { tournamentId, displayName } },
  );

  if (error) {
    if (isFunctionUnavailable(error)) {
      throw new TournamentFeatureUnavailableError(
        "La fonction de matchmaking Supabase n'est pas disponible. Déployez 'tournament-matchmaking'.",
      );
    }
    throw new Error(error.message);
  }

  return data ?? { match: null, registration: null };
};

export const reportTournamentMatch = async (
  matchId: string,
  result: "player1" | "player2" | "draw",
) => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } = await supabaseClient.functions.invoke<{
    match: TournamentMatch;
    leaderboard: TournamentLeaderboardEntry[];
  }>("report-tournament-match", { body: { matchId, result } });

  if (error) {
    if (isFunctionUnavailable(error)) {
      throw new TournamentFeatureUnavailableError(
        "La fonction de reporting Supabase n'est pas disponible. Déployez 'report-tournament-match'.",
      );
    }
    throw new Error(error.message);
  }

  return data;
};

export const fetchTournamentLeaderboard = async (
  tournamentId: string,
): Promise<TournamentLeaderboardEntry[]> => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } = await supabaseClient
    .from("tournament_registrations")
    .select("user_id, display_name, wins, losses, draws, points")
    .eq("tournament_id", tournamentId)
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("draws", { ascending: false });

  if (error) {
    if (isRelationMissing(error)) {
      throw new TournamentFeatureUnavailableError();
    }
    throw new Error(error.message);
  }

  return data ?? [];
};
