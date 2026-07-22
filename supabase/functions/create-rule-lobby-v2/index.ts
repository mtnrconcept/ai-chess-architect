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
      name?: unknown;
      mode?: unknown;
      ruleVersionIds?: unknown;
      requestKey?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const mode =
      body?.mode === "ai" || body?.mode === "player" ? body.mode : null;
    const rawIds = Array.isArray(body?.ruleVersionIds)
      ? body.ruleVersionIds
      : [];
    const ids = rawIds.filter(
      (value): value is string =>
        typeof value === "string" && UUID_PATTERN.test(value),
    );
    const requestKey =
      typeof body?.requestKey === "string" ? body.requestKey : "";

    if (name.length < 3 || name.length > 80) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Le nom du lobby doit contenir entre 3 et 80 caractères.",
      });
    }

    if (!mode) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Mode de lobby invalide.",
      });
    }

    if (mode === "player") {
      return jsonResponse(request, 409, {
        success: false,
        code: "CUSTOM_PVP_RUNTIME_NOT_AUTHORITATIVE",
        error:
          "Le jeu en ligne avec des règles personnalisées sera disponible lorsque le moteur serveur autoritaire sera activé. Choisis l’IA pour jouer cette variante maintenant.",
      });
    }

    if (
      ids.length < 1 ||
      ids.length > 8 ||
      ids.length !== rawIds.length ||
      ids.length !== new Set(ids).size
    ) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Sélectionne entre 1 et 8 versions de règles distinctes.",
      });
    }

    if (!UUID_PATTERN.test(requestKey)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Une clé de requête UUID valide est requise.",
      });
    }

    const { data, error } = await userClient.rpc("create_rule_lobby_v2", {
      p_name: name,
      p_rule_version_ids: ids,
      p_request_key: requestKey,
      p_mode: mode,
    });

    if (error) {
      throw new Error("LOBBY_CREATE_FAILED");
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Le lobby n'a pas été créé.");
    }

    return jsonResponse(request, 200, {
      success: true,
      data: {
        lobbyId: row.lobby_id,
        rulesetHash: row.ruleset_hash,
        matchSeed: row.match_seed === null ? null : Number(row.match_seed),
        legacyRuleIds: row.legacy_rule_ids,
      },
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      errorCode === "AUTH_REQUIRED" || errorCode === "AUTH_INVALID" ? 401 : 400;

    console.error("[create-rule-lobby-v2]", {
      code:
        status === 401 ? "AUTHENTICATION_FAILED" : "LOBBY_CREATION_REJECTED",
    });

    return jsonResponse(request, status, {
      success: false,
      error:
        status === 401
          ? "Authentification requise."
          : "Le lobby n'a pas pu être créé.",
    });
  }
});
