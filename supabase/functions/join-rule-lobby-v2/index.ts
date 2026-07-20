import { authenticateRequest } from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) {
    return preflight;
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, {
      success: false,
      error: "Méthode non autorisée.",
    });
  }

  try {
    const { userClient } = await authenticateRequest(request);
    const body = (await request.json().catch(() => null)) as {
      lobbyId?: unknown;
      displayName?: unknown;
    } | null;

    const lobbyId = typeof body?.lobbyId === "string" ? body.lobbyId : "";
    const displayName =
      typeof body?.displayName === "string"
        ? body.displayName.trim().slice(0, 80)
        : "";

    if (!UUID_PATTERN.test(lobbyId)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Identifiant de lobby invalide.",
      });
    }

    const { data, error } = await userClient.rpc("join_rule_lobby_v2", {
      p_lobby_id: lobbyId,
      p_opponent_name: displayName || null,
    });

    if (error) {
      throw new Error("LOBBY_JOIN_FAILED");
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Le lobby n'est plus disponible.");
    }

    return jsonResponse(request, 200, {
      success: true,
      data: {
        lobbyId: row.lobby_id,
        rulesetHash: row.ruleset_hash,
        matchSeed: Number(row.match_seed),
        legacyRuleIds: row.legacy_rule_ids,
      },
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      errorCode === "AUTH_REQUIRED" || errorCode === "AUTH_INVALID" ? 401 : 409;

    console.error("[join-rule-lobby-v2]", {
      code: status === 401 ? "AUTHENTICATION_FAILED" : "LOBBY_JOIN_REJECTED",
    });

    return jsonResponse(request, status, {
      success: false,
      error:
        status === 401
          ? "Authentification requise."
          : "Le lobby n'est plus disponible.",
    });
  }
});
