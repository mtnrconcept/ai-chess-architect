import type { TournamentLeaderboardEntry, TournamentSummary } from "@/models/Tournament";

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

export const fetchTournaments = async () => {
  const response = await fetch(withBase("/tournaments"));
  return handleResponse<TournamentSummary[]>(response);
};

export const seedTournaments = async () => {
  const response = await fetch(withBase("/tournaments/seed"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse<TournamentSummary[]>(response);
};

export const fetchTournamentLeaderboard = async (id: string) => {
  const response = await fetch(withBase(`/tournaments/${id}/leaderboard`));
  return handleResponse<TournamentLeaderboardEntry[]>(response);
};
