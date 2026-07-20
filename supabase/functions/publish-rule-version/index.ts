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
      compilationId?: unknown;
      visibility?: unknown;
    } | null;

    const compilationId =
      typeof body?.compilationId === "string" ? body.compilationId : "";
    const visibility =
      typeof body?.visibility === "string" ? body.visibility : "";

    if (!UUID_PATTERN.test(compilationId)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Identifiant de compilation invalide.",
      });
    }

    if (!["private", "unlisted", "public"].includes(visibility)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Visibilité invalide.",
      });
    }

    const { data, error } = await userClient.rpc(
      "publish_rule_compilation_v2",
      {
        p_compilation_id: compilationId,
        p_visibility: visibility,
      },
    );

    if (error) {
      throw new Error("RULE_PUBLICATION_FAILED");
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("La publication n'a retourné aucune version.");
    }

    return jsonResponse(request, 200, {
      success: true,
      data: {
        blueprintId: row.blueprint_id,
        versionId: row.version_id,
        versionNumber: row.version_number,
        legacyRuleId: row.legacy_rule_id,
        contentHash: row.content_hash,
      },
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      errorCode === "AUTH_REQUIRED" || errorCode === "AUTH_INVALID" ? 401 : 400;

    console.error("[publish-rule-version]", {
      code:
        status === 401 ? "AUTHENTICATION_FAILED" : "RULE_PUBLICATION_REJECTED",
    });

    return jsonResponse(request, status, {
      success: false,
      error:
        status === 401
          ? "Authentification requise."
          : "La règle n'a pas pu être publiée.",
    });
  }
});
