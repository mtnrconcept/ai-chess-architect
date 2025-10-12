import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseServiceRoleClient } from "../_shared/auth.ts";

const corsOptions = { methods: ["POST"] };

const supabase = getSupabaseServiceRoleClient();

const normaliseEnv = (value: string | null | undefined) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const AI_EMAIL = normaliseEnv(Deno.env.get("TOURNAMENT_AI_EMAIL")) ?? "voltus-bot@voltus-chess.ai";
const AI_DISPLAY_NAME = normaliseEnv(Deno.env.get("TOURNAMENT_AI_NAME")) ?? "Voltus AI";
const AI_AVATAR_URL = normaliseEnv(Deno.env.get("TOURNAMENT_AI_AVATAR_URL"));

const generateRandomSecret = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 12);

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
    .select("id, tournament_id, lobby_id, table_number, player1_id, player2_id, status, result, started_at, completed_at, lobby:lobbies(id, name, status, mode, opponent_name, opponent_id)")
    .eq("id", matchId)
    .single();

  if (error) {
    console.error("Unable to fetch match details", error.message);
    return null;
  }
  return data;
};

const fetchAiUser = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.admin.getUserByEmail(AI_EMAIL);
    if (error) {
      if (error.message && !error.message.toLowerCase().includes("no user found")) {
        console.warn("[tournament-matchmaking] Unable to fetch AI user:", error.message);
      }
      return null;
    }
    return data?.user ?? null;
  } catch (error) {
    console.error("[tournament-matchmaking] Failed to query AI user:", error instanceof Error ? error.message : error);
    return null;
  }
};

const createAiUser = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: AI_EMAIL,
      email_confirm: true,
      password: generateRandomSecret(),
      user_metadata: {
        full_name: AI_DISPLAY_NAME,
        is_ai_bot: true,
      },
    });

    if (error) {
      if (!error.message.toLowerCase().includes("already registered")) {
        console.error("[tournament-matchmaking] Unable to create AI user:", error.message);
      }
      return null;
    }

    return data?.user ?? null;
  } catch (error) {
    console.error("[tournament-matchmaking] Failed to create AI user:", error instanceof Error ? error.message : error);
    return null;
  }
};

const ensureAiUser = async () => {
  const existing = await fetchAiUser();
  if (existing) return existing;
  const created = await createAiUser();
  if (created) return created;
  return await fetchAiUser();
};

const countHumanRegistrations = async (tournamentId: string, aiUserId?: string) => {
  if (!supabase) return 0;

  const query = supabase
    .from("tournament_registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  if (aiUserId) {
    query.neq("user_id", aiUserId);
  }

  const { count, error } = await query;
  if (error) {
    console.error("[tournament-matchmaking] Unable to count registrations:", error.message);
    return 0;
  }

  return count ?? 0;
};

type AiAttachmentContext = {
  tournamentId: string;
  matchId: string;
  lobbyId: string | null;
  humanRegistrationId: string;
  nowIso: string;
};

const ensureAiOpponentForMatch = async (context: AiAttachmentContext) => {
  if (!supabase) return false;

  const preliminaryHumanCount = await countHumanRegistrations(context.tournamentId);
  if (preliminaryHumanCount > 1) {
    return false;
  }

  const aiUser = await ensureAiUser();
  if (!aiUser) {
    return false;
  }

  const confirmedHumanCount = await countHumanRegistrations(context.tournamentId, aiUser.id);
  if (confirmedHumanCount > 1) {
    return false;
  }

  const { error: upsertError } = await supabase
    .from("tournament_registrations")
    .upsert(
      {
        tournament_id: context.tournamentId,
        user_id: aiUser.id,
        display_name: AI_DISPLAY_NAME,
        avatar_url: AI_AVATAR_URL,
        current_match_id: context.matchId,
        is_waiting: false,
        last_active_at: context.nowIso,
      },
      { onConflict: "tournament_id,user_id" },
    );

  if (upsertError) {
    console.error("[tournament-matchmaking] Unable to upsert AI registration:", upsertError.message);
    return false;
  }

  const { error: updateMatchError } = await supabase
    .from("tournament_matches")
    .update({
      player2_id: aiUser.id,
      status: "in_progress",
      started_at: context.nowIso,
      updated_at: context.nowIso,
    })
    .eq("id", context.matchId)
    .eq("tournament_id", context.tournamentId);

  if (updateMatchError) {
    console.error("[tournament-matchmaking] Unable to attach AI to match:", updateMatchError.message);
    return false;
  }

  const humanUpdate = supabase
    .from("tournament_registrations")
    .update({ current_match_id: context.matchId, is_waiting: false, last_active_at: context.nowIso })
    .eq("id", context.humanRegistrationId);

  const aiUpdate = supabase
    .from("tournament_registrations")
    .update({ current_match_id: context.matchId, is_waiting: false, last_active_at: context.nowIso })
    .eq("tournament_id", context.tournamentId)
    .eq("user_id", aiUser.id);

  const updates = await Promise.allSettled([humanUpdate, aiUpdate]);
  updates.forEach(result => {
    if (result.status === "rejected") {
      console.warn("[tournament-matchmaking] Failed to update registration state:", result.reason);
    } else if (result.value.error) {
      console.warn("[tournament-matchmaking] Registration update warning:", result.value.error.message);
    }
  });

  if (context.lobbyId) {
    const { error: lobbyError } = await supabase
      .from("lobbies")
      .update({
        status: "matched",
        mode: "ai",
        opponent_id: aiUser.id,
        opponent_name: AI_DISPLAY_NAME,
        is_active: false,
      })
      .eq("id", context.lobbyId);

    if (lobbyError) {
      console.warn("[tournament-matchmaking] Unable to update lobby for AI opponent:", lobbyError.message);
    }
  }

  return true;
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
    let aiOpponentAttached = false;

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

      const attachedAi = await ensureAiOpponentForMatch({
        tournamentId,
        matchId: createdMatch.id,
        lobbyId: lobby.id,
        humanRegistrationId: registration.id,
        nowIso,
      });

      if (attachedAi) {
        registrationIsWaiting = false;
        aiOpponentAttached = true;
      } else {
        registrationIsWaiting = true;
      }

      matchResult = { ...createdMatch, lobby } as Record<string, unknown>;
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
          is_waiting: aiOpponentAttached ? false : registrationIsWaiting,
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
