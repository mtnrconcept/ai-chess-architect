import {
  resolveSupabaseFunctionUrl,
  supabase,
  supabaseAnonKey,
  supabaseDiagnostics,
  supabaseEnvProblems,
  supabaseFunctionsUrl,
} from "@/integrations/supabase/client";
import type { PostgrestError } from "@supabase/supabase-js";
import type {
  MatchmakingResponse,
  TournamentDetails,
  TournamentLeaderboardEntry,
  TournamentOverview,
  TournamentRegistrationWithMatch,
  TournamentMatch,
} from "@/types/tournament";

type TournamentStatus = TournamentOverview["status"];

const FALLBACK_VARIANT_NAME = "Variante Voltus";

const normaliseString = (value: unknown, fallback = "") => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (value != null) {
    const coerced = String(value).trim();
    if (coerced.length > 0) {
      return coerced;
    }
  }

  return fallback;
};

const normaliseIsoDate = (value: unknown, fallback?: string) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback ?? new Date().toISOString();
};

const normaliseNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const normaliseVariantRules = (value: unknown) => {
  const rules: string[] = [];

  const pushRule = (rule: unknown) => {
    if (typeof rule !== "string") {
      return;
    }
    const trimmed = rule.trim();
    if (trimmed.length > 0) {
      rules.push(trimmed);
    }
  };

  if (Array.isArray(value)) {
    value.forEach(pushRule);
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        parsed.forEach(pushRule);
      } else {
        pushRule(value);
      }
    } catch (_error) {
      value
        .split(",")
        .map((segment) => segment.trim())
        .forEach(pushRule);
    }
  }

  return rules.length > 0 ? rules : [];
};

const normaliseTournamentStatus = (value: unknown): TournamentStatus => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case "draft":
      case "scheduled":
      case "active":
      case "completed":
      case "cancelled":
        return normalized;
      case "running":
      case "in_progress":
        return "active";
      case "canceled":
        return "cancelled";
      case "complete":
        return "completed";
      default:
        break;
    }
  }

  return "scheduled";
};

const normaliseTournamentOverviewRow = (
  raw: Record<string, unknown>,
  overrides: Partial<
    Pick<
      TournamentOverview,
      "player_count" | "active_match_count" | "completed_match_count"
    >
  > = {},
): TournamentOverview => {
  const startsAt = normaliseIsoDate(
    raw.starts_at ?? raw.start_time ?? raw.startAt ?? raw.startsAt,
    normaliseIsoDate(
      raw.created_at ??
        raw.createdAt ??
        raw.start_time ??
        raw.startAt ??
        new Date(),
    ),
  );
  const endsAt = normaliseIsoDate(
    raw.ends_at ?? raw.end_time ?? raw.endAt ?? raw.endsAt,
    normaliseIsoDate(
      raw.updated_at ?? raw.updatedAt ?? raw.end_time ?? raw.endAt ?? startsAt,
    ),
  );

  const createdAt = normaliseIsoDate(
    raw.created_at ?? raw.createdAt ?? startsAt,
    startsAt,
  );
  const updatedAt = normaliseIsoDate(
    raw.updated_at ?? raw.updatedAt ?? createdAt,
    createdAt,
  );

  const basePlayerCount =
    overrides.player_count ??
    normaliseNumber(
      raw.player_count ?? raw.players ?? raw.playerCount ?? raw.total_players,
      0,
    );
  const baseActiveMatches =
    overrides.active_match_count ??
    normaliseNumber(
      raw.active_match_count ?? raw.active_matches ?? raw.activeMatchCount,
      0,
    );

  const completedFromRaw =
    raw.completed_match_count ??
    raw.completed_matches ??
    raw.matches_completed ??
    raw.matches ??
    raw.total_matches;

  const baseCompletedMatches =
    overrides.completed_match_count ?? normaliseNumber(completedFromRaw, 0);

  const variantName = normaliseString(raw.variant_name, FALLBACK_VARIANT_NAME);
  const variantSource =
    normaliseString(
      raw.variant_source ?? (raw.variant_lobby_id ? "lobby" : ""),
      "",
    ) || null;
  const variantLobbyId =
    normaliseString(raw.variant_lobby_id ?? raw.variantLobbyId ?? "", "") ||
    null;

  return {
    id: normaliseString(raw.id ?? raw.tournament_id ?? "", "__unknown__"),
    title: normaliseString(
      raw.title ?? raw.name ?? raw.tournament_title,
      "Tournoi Voltus",
    ),
    description:
      normaliseString(raw.description ?? raw.details ?? "", "") || null,
    variant_name: variantName,
    variant_source: variantSource,
    variant_rules: normaliseVariantRules(
      raw.variant_rules ?? raw.variantRules ?? [],
    ),
    variant_lobby_id: variantLobbyId,
    starts_at: startsAt,
    ends_at: endsAt,
    status: normaliseTournamentStatus(raw.status),
    max_participants: normaliseNumber(raw.max_participants, null),
    created_at: createdAt,
    updated_at: updatedAt,
    player_count: basePlayerCount,
    active_match_count: baseActiveMatches,
    completed_match_count: baseCompletedMatches,
  } satisfies TournamentOverview;
};

const sortByStartDate = (rows: TournamentOverview[]) =>
  [...rows].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

const normaliseMatchStatus = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const FINISHED_MATCH_STATUSES = new Set(["finished", "completed", "done"]);

const ACTIVE_MATCH_STATUSES = new Set([
  "pending",
  "playing",
  "in_progress",
  "running",
]);

export class TournamentFeatureUnavailableError extends Error {
  constructor(
    message = "Les tournois ne sont pas disponibles : configurez Supabase pour activer cette fonctionnalité.",
  ) {
    super(message);
    this.name = "TournamentFeatureUnavailableError";
  }
}

const SYNC_TOURNAMENTS_FUNCTION_PATH = "sync-tournaments";
const SYNC_TOURNAMENTS_UNAVAILABLE_MESSAGE =
  "La fonction 'sync-tournaments' n'est pas accessible (CORS/404). Déployez l'edge function correspondante sur Supabase.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normaliseSupabaseFunctionsBase = () => {
  const configuredBase =
    supabaseFunctionsUrl ?? supabaseDiagnostics.functionsUrl ?? null;
  if (configuredBase && configuredBase.trim().length > 0) {
    return configuredBase;
  }

  const projectId = supabaseDiagnostics.resolvedProjectId;
  if (typeof projectId === "string" && projectId.trim().length > 0) {
    return `https://${projectId.trim()}.functions.supabase.co`;
  }

  return null;
};

const resolveSupabaseFunctionsEndpoint = (path: string) => {
  const explicit = resolveSupabaseFunctionUrl(path);
  if (explicit) {
    return explicit;
  }

  const base = normaliseSupabaseFunctionsBase();
  if (!base) {
    return null;
  }

  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");

  return trimmedPath ? `${trimmedBase}/${trimmedPath}` : trimmedBase;
};

const isFetchNetworkError = (error: unknown): error is TypeError => {
  if (!(error instanceof TypeError)) {
    return false;
  }

  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("failed")
  );
};

const readFunctionErrorPayload = async (
  response: Response,
): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text;
  } catch (_error) {
    return null;
  }
};

const normaliseFunctionErrorMessage = (payload: unknown): string => {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : "";
  }

  if (!isRecord(payload)) {
    return "";
  }

  const candidates: unknown[] = [
    payload.error,
    payload.message,
    payload.msg,
    payload.detail,
    payload.hint,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (isRecord(candidate)) {
      const nested = normaliseFunctionErrorMessage(candidate);
      if (nested) {
        return nested;
      }
    }
  }

  return "";
};

const extractFunctionErrorCode = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { code } = payload;
  if (typeof code === "string" && code.trim().length > 0) {
    return code.trim().toLowerCase();
  }

  if (typeof code === "number" && Number.isFinite(code)) {
    return String(code);
  }

  return undefined;
};

const invokeSyncTournamentsViaDirectFetch = async (
  supabaseClient: ReturnType<typeof requireTournamentSupabase>,
): Promise<void> => {
  const endpoint = resolveSupabaseFunctionsEndpoint(
    SYNC_TOURNAMENTS_FUNCTION_PATH,
  );
  if (!endpoint) {
    throw new TournamentFeatureUnavailableError(
      SYNC_TOURNAMENTS_UNAVAILABLE_MESSAGE,
    );
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "x-client-info": "ai-chess-architect-web",
  });

  if (supabaseAnonKey) {
    headers.set("apikey", supabaseAnonKey);
  }

  let accessToken: string | null | undefined;
  try {
    const { data } = await supabaseClient.auth.getSession();
    accessToken = data.session?.access_token;
  } catch (_error) {
    accessToken = undefined;
  }

  const bearerToken =
    typeof accessToken === "string" && accessToken.trim().length > 0
      ? accessToken
      : typeof supabaseAnonKey === "string" && supabaseAnonKey.trim().length > 0
        ? supabaseAnonKey
        : undefined;

  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (response.ok) {
    return;
  }

  const payload = await readFunctionErrorPayload(response);
  const message = normaliseFunctionErrorMessage(payload);

  if (response.status === 404) {
    throw new TournamentFeatureUnavailableError(
      SYNC_TOURNAMENTS_UNAVAILABLE_MESSAGE,
    );
  }

  const code = extractFunctionErrorCode(payload);
  if (response.status === 503 && code === "feature_unavailable") {
    throw new TournamentFeatureUnavailableError(
      message ||
        "La synchronisation des tournois n'est pas disponible. Vérifiez votre déploiement Supabase.",
    );
  }

  if (message) {
    throw new Error(message);
  }

  throw new Error(
    `La fonction 'sync-tournaments' a renvoyé le statut ${response.status}.`,
  );
};

const requireTournamentSupabase = () => {
  if (!supabase) {
    const details =
      supabaseEnvProblems.length > 0
        ? ` Détails : ${supabaseEnvProblems.join(" | ")}.`
        : "";
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

  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
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

  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details =
    typeof error.details === "string" ? error.details.toLowerCase() : "";

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

const isFunctionUnavailable = (
  error: { message?: string | null; code?: string | null } & ErrorWithStatus,
) => {
  if (!error) {
    return false;
  }

  const status = extractStatusCode(error);
  if (status === 404 || status === 503) {
    return true;
  }

  const code = normaliseErrorCode(error.code);
  if (
    code &&
    (code === "FEATURE_UNAVAILABLE" || MISSING_RELATION_ERROR_CODES.has(code))
  ) {
    return true;
  }

  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
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

const fetchTournamentOverviewFromBaseTables = async (
  tournamentId?: string,
): Promise<TournamentOverview[]> => {
  const supabaseClient = requireTournamentSupabase();

  const tournamentsQuery = supabaseClient.from("tournaments").select("*");

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

  const tournamentList = (tournaments ?? [])
    .map((row) =>
      normaliseTournamentOverviewRow(row as Record<string, unknown>),
    )
    .filter((tournament) => tournament.id !== "__unknown__");

  if (tournamentList.length === 0) {
    return [];
  }

  const tournamentIds = tournamentList
    .map((tournament) => tournament.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const registrationCounts = new Map<string, number>();
  const matchCounts = new Map<string, { active: number; finished: number }>();

  if (tournamentIds.length > 0) {
    const { data: registrations, error: registrationsError } =
      await supabaseClient
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

    (registrations ?? []).forEach((registration) => {
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

    (matches ?? []).forEach((match) => {
      const id = match.tournament_id;
      if (!id) return;
      const counts = matchCounts.get(id) ?? { active: 0, finished: 0 };
      const status = normaliseMatchStatus(match.status);
      if (FINISHED_MATCH_STATUSES.has(status)) {
        counts.finished += 1;
      } else if (status && ACTIVE_MATCH_STATUSES.has(status)) {
        counts.active += 1;
      }
      matchCounts.set(id, counts);
    });
  }

  return sortByStartDate(
    tournamentList.map((tournament) =>
      normaliseTournamentOverviewRow(tournament, {
        player_count:
          registrationCounts.get(tournament.id) ?? tournament.player_count ?? 0,
        active_match_count:
          matchCounts.get(tournament.id)?.active ??
          tournament.active_match_count ??
          0,
        completed_match_count:
          matchCounts.get(tournament.id)?.finished ??
          tournament.completed_match_count ??
          0,
      }),
    ),
  );
};

const fetchSingleTournamentOverview = async (
  tournamentId: string,
): Promise<TournamentOverview> => {
  const supabaseClient = requireTournamentSupabase();

  try {
    const { data, error } = await supabaseClient
      .from("tournament_overview")
      .select("*")
      .eq("id", tournamentId)
      .maybeSingle();

    if (data) {
      return normaliseTournamentOverviewRow(data as Record<string, unknown>);
    }

    if (isOverviewViewMissing(error)) {
      const fallback =
        await fetchTournamentOverviewFromBaseTables(tournamentId);
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
    const { error } = await supabaseClient.functions.invoke(
      "sync-tournaments",
      { body: {} },
    );
    if (error) {
      // Ignore schema cache errors - PostgREST just needs time to refresh
      const message = typeof error.message === "string" ? error.message : "";
      const isSchemaCache = message.toLowerCase().includes("schema cache");

      if (isSchemaCache) {
        console.warn(
          "[syncTournaments] PostgREST schema cache refreshing, continuing...",
        );
        return;
      }

      if (isFunctionUnavailable(error)) {
        throw new TournamentFeatureUnavailableError(
          "La synchronisation des tournois n'est pas disponible. Vérifiez le déploiement de l'edge function 'sync-tournaments' et appliquez les migrations Supabase associées.",
        );
      }

      throw new Error(message || "Impossible de synchroniser les tournois");
    }
  } catch (unknownError) {
    if (isFetchNetworkError(unknownError)) {
      try {
        await invokeSyncTournamentsViaDirectFetch(supabaseClient);
        return;
      } catch (fallbackError) {
        if (fallbackError instanceof TournamentFeatureUnavailableError) {
          throw fallbackError;
        }

        if (isFetchNetworkError(fallbackError)) {
          throw new TournamentFeatureUnavailableError(
            SYNC_TOURNAMENTS_UNAVAILABLE_MESSAGE,
          );
        }

        if (fallbackError instanceof Error) {
          throw fallbackError;
        }

        throw new Error("Impossible de synchroniser les tournois");
      }
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

export const fetchTournamentOverview = async (): Promise<
  TournamentOverview[]
> => {
  const supabaseClient = requireTournamentSupabase();

  try {
    const { data, error } = await supabaseClient
      .from("tournament_overview")
      .select("*");

    if (error) {
      if (isOverviewViewMissing(error)) {
        return fetchTournamentOverviewFromBaseTables();
      }
      if (isRelationMissing(error)) {
        throw new TournamentFeatureUnavailableError();
      }
      throw new Error(error.message);
    }

    return sortByStartDate(
      (data ?? [])
        .map((row) =>
          normaliseTournamentOverviewRow(row as Record<string, unknown>),
        )
        .filter((row) => row.id !== "__unknown__"),
    );
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

export const fetchTournamentDetails = async (
  tournamentId: string,
): Promise<TournamentDetails> => {
  const supabaseClient = requireTournamentSupabase();
  const overviewData = await fetchSingleTournamentOverview(tournamentId);

  const { data: registrations, error: registrationsError } =
    await supabaseClient
      .from("tournament_registrations")
      .select(
        `
        *,
        current_match:tournament_matches!tournament_registrations_current_match_id_fkey(
          *,
          lobby:lobbies!lobby_id(id, name, status, mode, opponent_name, opponent_id)
        )
      `,
      )
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
    .select(
      "*, lobby:lobbies(id, name, status, mode, opponent_name, opponent_id)",
    )
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
    registrations: (registrations ??
      []) as unknown as TournamentRegistrationWithMatch[],
    matches: (matches ?? []) as unknown as TournamentMatch[],
  };
};

export const fetchUserTournamentRegistrations = async (
  userId: string,
): Promise<TournamentRegistrationWithMatch[]> => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } = await supabaseClient
    .from("tournament_registrations")
    .select(
      `
      *,
      current_match:tournament_matches!tournament_registrations_current_match_id_fkey(
        *,
        lobby:lobbies!lobby_id(id, name, status, mode, opponent_name, opponent_id)
      )
    `,
    )
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

export type RequestTournamentMatchOptions = {
  displayName?: string;
  forceAiFallback?: boolean;
};

export const requestTournamentMatch = async (
  tournamentId: string,
  options?: RequestTournamentMatchOptions,
): Promise<MatchmakingResponse> => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } =
    await supabaseClient.functions.invoke<MatchmakingResponse>(
      "tournament-matchmaking",
      {
        body: {
          tournamentId,
          displayName: options?.displayName,
          forceAiFallback: options?.forceAiFallback === true,
        },
      },
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

export const fetchTournamentMatch = async (
  matchId: string,
): Promise<TournamentMatch | null> => {
  const supabaseClient = requireTournamentSupabase();

  const { data, error } = await supabaseClient
    .from("tournament_matches")
    .select(
      "*, lobby:lobbies(id, name, status, mode, opponent_name, opponent_id)",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    if (isRelationMissing(error)) {
      throw new TournamentFeatureUnavailableError();
    }
    throw new Error(error.message);
  }

  return (data ?? null) as unknown as TournamentMatch | null;
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
