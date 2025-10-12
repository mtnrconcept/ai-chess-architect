import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";

const corsOptions = { methods: ["POST"] };

const normaliseEnv = (value: string | undefined | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const SUPABASE_URL =
  normaliseEnv(Deno.env.get("SUPABASE_URL")) ?? normaliseEnv(Deno.env.get("VITE_SUPABASE_URL"));
const SERVICE_ROLE_KEY =
  normaliseEnv(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ??
  normaliseEnv(Deno.env.get("SUPABASE_SERVICE_ROLE")) ??
  normaliseEnv(Deno.env.get("SERVICE_ROLE_KEY"));

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase configuration for report-tournament-match function (SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE)"
  );
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

type MatchResult = "player1" | "player2" | "draw";

const computeStandingsDelta = (result: MatchResult, isPlayerOne: boolean) => {
  if (result === "draw") {
    return { wins: 0, losses: 0, draws: 1, points: 0.5 };
  }

  if ((result === "player1" && isPlayerOne) || (result === "player2" && !isPlayerOne)) {
    return { wins: 1, losses: 0, draws: 0, points: 1 };
  }

  return { wins: 0, losses: 1, draws: 0, points: 0 };
};

serve(async req => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  if (req.method !== "POST") {
    return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
  }

  if (!supabase) {
    return jsonResponse(req, { error: "Supabase client misconfigured" }, { status: 500 }, corsOptions);
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return jsonResponse(req, { error: "Missing access token" }, { status: 401 }, corsOptions);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    const message = authError?.message ?? "Unable to verify user";
    return jsonResponse(req, { error: message }, { status: 401 }, corsOptions);
  }

  const user = authData.user;

  try {
    const body = await req.json();
    const matchId = typeof body?.matchId === "string" ? body.matchId : null;
    const result = body?.result as MatchResult | null;

    if (!matchId || !result || !["player1", "player2", "draw"].includes(result)) {
      return jsonResponse(req, { error: "matchId et result sont requis" }, { status: 400 }, corsOptions);
    }

    const { data: match, error: matchError } = await supabase
      .from("tournament_matches")
      .select("id, tournament_id, player1_id, player2_id, status, result, winner_id, lobby_id")
      .eq("id", matchId)
      .single();

    if (matchError || !match) {
      const message = matchError?.message ?? "Match introuvable";
      return jsonResponse(req, { error: message }, { status: 404 }, corsOptions);
    }

    if (match.status === "completed") {
      return jsonResponse(req, { error: "Le résultat a déjà été enregistré" }, { status: 409 }, corsOptions);
    }

    if (!match.player2_id) {
      return jsonResponse(req, { error: "Le match n'a pas encore d'adversaire" }, { status: 409 }, corsOptions);
    }

    if (user.id !== match.player1_id && user.id !== match.player2_id) {
      return jsonResponse(req, { error: "Vous ne participez pas à ce match" }, { status: 403 }, corsOptions);
    }

    const winnerId = result === "draw"
      ? null
      : result === "player1"
        ? match.player1_id
        : match.player2_id;

    const nowIso = new Date().toISOString();

    const { error: updateMatchError } = await supabase
      .from("tournament_matches")
      .update({
        status: "completed",
        result,
        winner_id: winnerId,
        reported_by: user.id,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", matchId);

    if (updateMatchError) {
      console.error("Unable to update match", updateMatchError.message);
      return jsonResponse(req, { error: "Impossible d'enregistrer le résultat" }, { status: 500 }, corsOptions);
    }

    if (match.lobby_id) {
      await supabase
        .from("lobbies")
        .update({ is_active: false })
        .eq("id", match.lobby_id);
    }

    const { data: registrations, error: registrationsError } = await supabase
      .from("tournament_registrations")
      .select("user_id, wins, losses, draws, points")
      .eq("tournament_id", match.tournament_id)
      .in("user_id", [match.player1_id, match.player2_id]);

    if (registrationsError) {
      console.error("Unable to fetch registrations", registrationsError.message);
      return jsonResponse(req, { error: "Impossible de mettre à jour le classement" }, { status: 500 }, corsOptions);
    }

    const registrationMap = new Map(registrations?.map(entry => [entry.user_id, entry] as const));

    const playerOneDelta = computeStandingsDelta(result, true);
    const playerTwoDelta = computeStandingsDelta(result, false);

    const playerOneStats = registrationMap.get(match.player1_id);
    const playerTwoStats = registrationMap.get(match.player2_id);

    const updates = [
      {
        userId: match.player1_id,
        wins: (playerOneStats?.wins ?? 0) + playerOneDelta.wins,
        losses: (playerOneStats?.losses ?? 0) + playerOneDelta.losses,
        draws: (playerOneStats?.draws ?? 0) + playerOneDelta.draws,
        points: (playerOneStats?.points ?? 0) + playerOneDelta.points,
      },
      {
        userId: match.player2_id,
        wins: (playerTwoStats?.wins ?? 0) + playerTwoDelta.wins,
        losses: (playerTwoStats?.losses ?? 0) + playerTwoDelta.losses,
        draws: (playerTwoStats?.draws ?? 0) + playerTwoDelta.draws,
        points: (playerTwoStats?.points ?? 0) + playerTwoDelta.points,
      },
    ];

    for (const update of updates) {
      await supabase
        .from("tournament_registrations")
        .update({
          wins: update.wins,
          losses: update.losses,
          draws: update.draws,
          points: update.points,
          current_match_id: null,
          is_waiting: false,
          last_active_at: nowIso,
        })
        .eq("tournament_id", match.tournament_id)
        .eq("user_id", update.userId);
    }

    const { data: leaderboard, error: leaderboardError } = await supabase
      .from("tournament_registrations")
      .select("user_id, display_name, wins, losses, draws, points")
      .eq("tournament_id", match.tournament_id)
      .order("points", { ascending: false })
      .order("wins", { ascending: false })
      .order("draws", { ascending: false });

    if (leaderboardError) {
      console.error("Unable to fetch leaderboard", leaderboardError.message);
    }

    return jsonResponse(
      req,
      {
        match: { ...match, status: "completed", result, winner_id: winnerId },
        leaderboard: leaderboard ?? [],
      },
      { status: 200 },
      corsOptions,
    );
  } catch (error) {
    console.error("report-tournament-match error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: message }, { status: 500 }, corsOptions);
  }
});
