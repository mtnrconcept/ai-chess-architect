import type { TournamentLeaderboardEntry, TournamentSummary } from "@/models/Tournament";
import {
  getMockTournamentLeaderboard,
  listMockTournaments,
  reseedMockTournaments,
} from "@/lib/mockTournamentGenerator";

const API_BASE = import.meta.env.VITE_TOURNAMENT_API_BASE ?? "http://localhost:4000/api";

const withBase = (path: string) => {
  const trimmedBase = API_BASE.replace(/\/$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
};

const handleResponse = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch (error) {
      if (error instanceof Error) {
        message = error.message;
      }
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
};

const isNetworkError = (error: unknown) => {
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    return /Failed to fetch|NetworkError/i.test(error.message);
  }
  return false;
};

export const fetchTournaments = async () => {
  try {
    const response = await fetch(withBase("/tournaments"));
    return await handleResponse<TournamentSummary[]>(response);
  } catch (error) {
    if (isNetworkError(error)) {
      console.warn("Tournament API unreachable, using mock tournaments.", error);
      return listMockTournaments();
    }
    throw error;
  }
};

export const seedTournaments = async () => {
  try {
    const response = await fetch(withBase("/tournaments/seed"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return await handleResponse<TournamentSummary[]>(response);
  } catch (error) {
    if (isNetworkError(error)) {
      console.warn("Tournament API unreachable during seed, using mock tournaments.", error);
      return reseedMockTournaments();
    }
    throw error;
  }
};

export const fetchTournamentLeaderboard = async (id: string) => {
  try {
    const response = await fetch(withBase(`/tournaments/${id}/leaderboard`));
    return await handleResponse<TournamentLeaderboardEntry[]>(response);
  } catch (error) {
    if (isNetworkError(error)) {
      console.warn("Tournament API unreachable while loading leaderboard, using mock data.", error);
      return getMockTournamentLeaderboard(id);
    }
    throw error;
  }
};
