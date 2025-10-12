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
    "Missing Supabase configuration for tournament matchmaking function (SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE)"
  );
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

const inferDisplayName = (user: { email?: string | null; user_metadata?: Record<string, unknown> }, fallback?: string | null) => {
  const metadata = user.user_metadata ?? {};
  const candidates = ["full_name", "name", "username"].map(key => {
    const value = metadata[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  });

  const fromMetadata = candidates.find(value => value !== null);
  if (fromMetadata) return fromMetadata;

  if (fallback && fallback.trim().length > 0) {
    return fallback.trim();
  }

  if (typeof user.email === "string" && user.email.length > 0) {
    return user.email.split("@")[0] ?? user.email;
  }

  return "Joueur Voltus";
};

const getMatchDetails = async (matchId: string) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tournament_matches")
    .select("id, tournament_id, lobby_id, table_number, player1_id, player2_id, status, result, started_at, completed_at, lobby:lobbies(id, name, status, opponent_name, opponent_id)")
    .eq("id", matchId)
    .single();

  if (error) {
    console.error("Unable to fetch match details", error.message);
    return null;
  }
  return data;
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
    const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId : null;
    const requestedName = typeof body?.displayName === "string" ? body.displayName : null;

    if (!tournamentId) {
      return jsonResponse(req, { error: "tournamentId is required" }, { status: 400 }, corsOptions);
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, start_time, end_time, status, variant_rules, variant_name")
      .eq("id", tournamentId)
      .single();

    if (tournamentError || !tournament) {
      const message = tournamentError?.message ?? "Tournament not found";
      return jsonResponse(req, { error: message }, { status: 404 }, corsOptions);
    }

    const now = new Date();
    const start = new Date(tournament.start_time);
    const end = new Date(tournament.end_time);

    if (now < start) {
      return jsonResponse(req, { error: "Le tournoi n'a pas encore commencé" }, { status: 409 }, corsOptions);
    }

    if (now >= end) {
      return jsonResponse(req, { error: "Le tournoi est terminé" }, { status: 409 }, corsOptions);
    }

    const displayName = inferDisplayName(user, requestedName);
    const nowIso = now.toISOString();

    const { data: registration, error: registrationError } = await supabase
      .from("tournament_registrations")
      .upsert({
        tournament_id: tournamentId,
        user_id: user.id,
        display_name: displayName,
        avatar_url: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata?.avatar_url : null,
        last_active_at: nowIso,
      }, { onConflict: "tournament_id,user_id" })
      .select("id, tournament_id, user_id, current_match_id, is_waiting, wins, losses, draws, points")
      .eq("tournament_id", tournamentId)
      .eq("user_id", user.id)
      .single();

    if (registrationError || !registration) {
      const message = registrationError?.message ?? "Impossible d'enregistrer la participation";
      return jsonResponse(req, { error: message }, { status: 500 }, corsOptions);
    }

    if (registration.current_match_id) {
      const match = await getMatchDetails(registration.current_match_id);
      return jsonResponse(req, { match, registration }, { status: 200 }, corsOptions);
    }

    const { data: waitingMatches, error: waitingError } = await supabase
      .from("tournament_matches")
      .select("id, lobby_id, player1_id, table_number")
      .eq("tournament_id", tournamentId)
      .eq("status", "pending")
      .is("player2_id", null)
      .neq("player1_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (waitingError) {
      console.error("Unable to fetch waiting matches", waitingError.message);
    }

    let matchResult: Record<string, unknown> | null = null;
    let registrationIsWaiting = false;

    if (waitingMatches && waitingMatches.length > 0) {
      const openMatch = waitingMatches[0];
      const { data: claimedMatches, error: claimError } = await supabase
        .from("tournament_matches")
        .update({
          player2_id: user.id,
          status: "in_progress",
          started_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", openMatch.id)
        .is("player2_id", null)
        .select("id, tournament_id, lobby_id, player1_id, player2_id, status, table_number, started_at, variant_rules")
        .single();

      if (!claimError && claimedMatches) {
        matchResult = claimedMatches as Record<string, unknown>;
        registrationIsWaiting = false;

        await supabase
          .from("tournament_registrations")
          .update({ current_match_id: claimedMatches.id, is_waiting: false, last_active_at: nowIso })
          .eq("tournament_id", tournamentId)
          .eq("user_id", user.id);

        await supabase
          .from("tournament_registrations")
          .update({ current_match_id: claimedMatches.id, is_waiting: false, last_active_at: nowIso })
          .eq("tournament_id", tournamentId)
          .eq("user_id", claimedMatches.player1_id);

        if (claimedMatches.lobby_id) {
          await supabase
            .from("lobbies")
            .update({ status: "matched", opponent_id: user.id, opponent_name: displayName, is_active: false })
            .eq("id", claimedMatches.lobby_id);
        }
      }
    }

    if (!matchResult) {
      const { data: lastTable, error: tableError } = await supabase
        .from("tournament_matches")
        .select("table_number")
        .eq("tournament_id", tournamentId)
        .order("table_number", { ascending: false })
        .limit(1);

      if (tableError) {
        console.error("Unable to fetch table number", tableError.message);
      }

      const nextTableNumber = ((lastTable?.[0]?.table_number as number | null) ?? 0) + 1;

      const { data: lobby, error: lobbyError } = await supabase
        .from("lobbies")
        .insert({
          name: `${tournament.name} · Table ${nextTableNumber}`,
          creator_id: user.id,
          active_rules: tournament.variant_rules,
          max_players: 2,
          is_active: true,
          mode: "player",
          status: "waiting",
        })
        .select("id, name, status")
        .single();

      if (lobbyError || !lobby) {
        const message = lobbyError?.message ?? "Impossible de créer la salle du tournoi";
        return jsonResponse(req, { error: message }, { status: 500 }, corsOptions);
      }

      const { data: createdMatch, error: matchError } = await supabase
        .from("tournament_matches")
        .insert({
          tournament_id: tournamentId,
          lobby_id: lobby.id,
          player1_id: user.id,
          status: "pending",
          variant_rules: tournament.variant_rules,
          table_number: nextTableNumber,
        })
        .select("id, tournament_id, lobby_id, player1_id, player2_id, status, table_number, variant_rules")
        .single();

      if (matchError || !createdMatch) {
        const message = matchError?.message ?? "Impossible de créer le match";
        return jsonResponse(req, { error: message }, { status: 500 }, corsOptions);
      }

      await supabase
        .from("tournament_registrations")
        .update({ current_match_id: createdMatch.id, is_waiting: true, last_active_at: nowIso })
        .eq("tournament_id", tournamentId)
        .eq("user_id", user.id);

      matchResult = { ...createdMatch, lobby } as Record<string, unknown>;
      registrationIsWaiting = true;
    }

    if (!matchResult) {
      return jsonResponse(req, { error: "Impossible de créer une appariement" }, { status: 500 }, corsOptions);
    }

    const finalMatchId = typeof matchResult.id === "string"
      ? matchResult.id
      : typeof matchResult["id"] === "string"
        ? matchResult["id"] as string
        : null;

    const match = finalMatchId ? await getMatchDetails(finalMatchId) : null;

    return jsonResponse(
      req,
      {
        match,
        registration: {
          ...registration,
          current_match_id: finalMatchId,
          is_waiting: registrationIsWaiting,
        },
      },
      { status: 200 },
      corsOptions,
    );
  } catch (error) {
    console.error("tournament-matchmaking error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(req, { error: message }, { status: 500 }, corsOptions);
  }
});
