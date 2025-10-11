import { supabase } from "@/integrations/supabase/client";

export type UserGameSummary = {
  id: string;
  result: "win" | "loss" | "draw" | "aborted";
  mode: string | null;
  pgn: string | null;
  created_at: string;
};

export type LobbyRow = {
  id: string;
  name: string;
  creator_id: string;
  status: string;
  created_at: string;
};

export type TournamentRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "running" | "completed" | "canceled";
};

export type TournamentOverviewRow = {
  id: string;
  name: string;
  players: number;
  matches: number;
  start_time: string;
};

export async function saveCompletedGame(input: {
  userId: string;
  opponentId?: string | null;
  result: "win" | "loss" | "draw" | "aborted";
  mode?: string;
  pgn?: string | null;
  moves?: unknown[];
}) {
  const payload = {
    user_id: input.userId,
    opponent_id: input.opponentId ?? null,
    result: input.result,
    mode: input.mode ?? "standard",
    pgn: input.pgn ?? null,
    moves: input.moves ? input.moves : [],
  };
  const { error } = await supabase.from("user_games").insert(payload);
  if (error) throw error;
}

export async function fetchGameHistory(userId: string, page = 0, pageSize = 20) {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await supabase
    .from("user_games")
    .select<UserGameSummary>("id,result,mode,pgn,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return data ?? [];
}

export async function fetchWaitingLobbies() {
  const { data, error } = await supabase
    .from("lobbies")
    .select<LobbyRow>("id,name,creator_id,status,created_at")
    .eq("mode", "player")
    .eq("status", "waiting")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select<TournamentRow>("id,name,start_time,end_time,status")
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTournamentOverview() {
  const { data, error } = await supabase
    .from("tournament_overview")
    .select<TournamentOverviewRow>("id,name,players,matches,start_time")
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
