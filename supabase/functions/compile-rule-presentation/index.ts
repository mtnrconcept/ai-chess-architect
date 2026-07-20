import { authenticateRequest } from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";
import { createStructuredResponse } from "../_shared/openai-responses.ts";
import {
  PRESENTATION_BLUEPRINT_JSON_SCHEMA,
  buildPresentationArchitectSystemPrompt,
  buildPresentationArchitectUserPrompt,
  resolvePresentationAsset,
  validatePresentationBlueprint,
  type CompilePresentationResponse,
  type PresentationDiagnostic,
  type ResolvedPresentationAsset,
} from "../_shared/presentation-v1/index.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROCESSING_STALE_MS = 3 * 60 * 1000;
const MAX_PROMPT_CHARS = 4_000;

interface PresentationRow {
  id: string;
  compilation_id: string;
  user_id: string;
  status: "processing" | "ready" | "fallback" | "failed";
  model: string;
  blueprint: unknown;
  resolved_assets: unknown;
  diagnostics: unknown;
  metrics: unknown;
  content_hash: string | null;
  request_id: string | null;
  updated_at: string;
}

const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`SERVER_CONFIG_${name}`);
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
};

const sha256Text = async (value: unknown): Promise<string> => {
  const encoded = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const safeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const responseFromRow = (row: PresentationRow): CompilePresentationResponse | null => {
  if (
    (row.status !== "ready" && row.status !== "fallback") ||
    !isRecord(row.blueprint) ||
    !Array.isArray(row.resolved_assets) ||
    !Array.isArray(row.diagnostics) ||
    !row.content_hash
  ) {
    return null;
  }
  const metrics = isRecord(row.metrics) ? row.metrics : {};
  return {
    presentationId: row.id,
    status: row.status,
    model: row.model,
    requestId: row.request_id,
    contentHash: row.content_hash,
    blueprint: row.blueprint as CompilePresentationResponse["blueprint"],
    assets: row.resolved_assets as CompilePresentationResponse["assets"],
    diagnostics: row.diagnostics as CompilePresentationResponse["diagnostics"],
    generationDurationMs: safeNumber(metrics.generationDurationMs),
  };
};

const readPresentation = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  filters: { compilationId?: string; requestKey?: string; userId: string },
): Promise<PresentationRow | null> => {
  let query = serviceClient
    .from("rule_presentations")
    .select(
      "id,compilation_id,user_id,status,model,blueprint,resolved_assets,diagnostics,metrics,content_hash,request_id,updated_at",
    )
    .eq("user_id", filters.userId);
  if (filters.compilationId) query = query.eq("compilation_id", filters.compilationId);
  if (filters.requestKey) query = query.eq("request_key", filters.requestKey);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("PRESENTATION_READ_FAILED");
  return (data as PresentationRow | null) ?? null;
};

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  if (request.method !== "POST") {
    return jsonResponse(request, 405, {
      success: false,
      error: "Méthode non autorisée.",
    });
  }

  let presentationId: string | null = null;
  try {
    const { user, serviceClient } = await authenticateRequest(request);
    const body = (await request.json().catch(() => null)) as {
      compilationId?: unknown;
      requestKey?: unknown;
    } | null;
    const compilationId =
      typeof body?.compilationId === "string" ? body.compilationId : "";
    const requestKey = typeof body?.requestKey === "string" ? body.requestKey : "";

    if (!UUID_PATTERN.test(compilationId) || !UUID_PATTERN.test(requestKey)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Identifiants de compilation ou de requête invalides.",
        code: "INVALID_REQUEST",
      });
    }

    const { data: compilation, error: compilationError } = await serviceClient
      .from("rule_compilations")
      .select("id,user_id,prompt,blueprint,status,expires_at")
      .eq("id", compilationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (compilationError) throw new Error("COMPILATION_READ_FAILED");
    if (!compilation) {
      return jsonResponse(request, 404, {
        success: false,
        error: "Compilation introuvable.",
        code: "COMPILATION_NOT_FOUND",
      });
    }
    if (compilation.status !== "validated") {
      return jsonResponse(request, 409, {
        success: false,
        error: "Seule une règle validée peut recevoir une présentation.",
        code: "COMPILATION_NOT_READY",
      });
    }
    if (
      typeof compilation.expires_at !== "string" ||
      Date.parse(compilation.expires_at) <= Date.now()
    ) {
      return jsonResponse(request, 410, {
        success: false,
        error: "La compilation a expiré.",
        code: "COMPILATION_EXPIRED",
        newRequestRequired: true,
      });
    }
    const userPrompt =
      typeof compilation.prompt === "string" ? compilation.prompt.trim() : "";
    if (userPrompt.length < 20 || userPrompt.length > MAX_PROMPT_CHARS) {
      throw new Error("COMPILATION_PROMPT_INVALID");
    }

    const requestReplay = await readPresentation(serviceClient, {
      requestKey,
      userId: user.id,
    });
    if (requestReplay && requestReplay.compilation_id !== compilationId) {
      return jsonResponse(request, 409, {
        success: false,
        error: "Cette clé de requête appartient déjà à une autre compilation.",
        code: "REQUEST_KEY_CONFLICT",
        newRequestRequired: true,
      });
    }

    let existing =
      requestReplay ??
      (await readPresentation(serviceClient, {
        compilationId,
        userId: user.id,
      }));
    const replay = existing ? responseFromRow(existing) : null;
    if (replay) {
      return jsonResponse(request, 200, { success: true, data: replay });
    }

    const model =
      Deno.env.get("OPENAI_PRESENTATION_MODEL")?.trim() ||
      Deno.env.get("OPENAI_RULE_MODEL")?.trim() ||
      "gpt-5.6-terra";
    const now = new Date().toISOString();

    if (existing) {
      const updatedAt = Date.parse(existing.updated_at);
      const stale =
        !Number.isFinite(updatedAt) || Date.now() - updatedAt > PROCESSING_STALE_MS;
      if (existing.status === "processing" && !stale) {
        return jsonResponse(request, 409, {
          success: false,
          error: "La présentation est déjà en cours de génération.",
          code: "PRESENTATION_IN_PROGRESS",
          retryable: true,
        });
      }

      const { data: reclaimed, error: reclaimError } = await serviceClient
        .from("rule_presentations")
        .update({
          status: "processing",
          request_key: requestKey,
          model,
          blueprint: {},
          resolved_assets: [],
          diagnostics: [],
          metrics: {},
          content_hash: null,
          request_id: null,
          updated_at: now,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .in("status", ["processing", "failed"])
        .select("id")
        .maybeSingle();
      if (reclaimError || !reclaimed) {
        throw new Error("PRESENTATION_RECLAIM_FAILED");
      }
      presentationId = reclaimed.id as string;
    } else {
      const { data: inserted, error: insertError } = await serviceClient
        .from("rule_presentations")
        .insert({
          compilation_id: compilationId,
          user_id: user.id,
          request_key: requestKey,
          status: "processing",
          model,
          blueprint: {},
          resolved_assets: [],
          diagnostics: [],
          metrics: {},
          updated_at: now,
        })
        .select("id")
        .maybeSingle();

      if (insertError || !inserted) {
        existing = await readPresentation(serviceClient, {
          compilationId,
          userId: user.id,
        });
        const racedReplay = existing ? responseFromRow(existing) : null;
        if (racedReplay) {
          return jsonResponse(request, 200, {
            success: true,
            data: racedReplay,
          });
        }
        if (existing?.status === "processing") {
          return jsonResponse(request, 409, {
            success: false,
            error: "La présentation est déjà en cours de génération.",
            code: "PRESENTATION_IN_PROGRESS",
            retryable: true,
          });
        }
        throw new Error("PRESENTATION_INSERT_FAILED");
      }
      presentationId = inserted.id as string;
    }

    const startedAt = performance.now();
    const structured = await createStructuredResponse({
      apiKey: requiredEnv("OPENAI_API_KEY"),
      model,
      systemPrompt: buildPresentationArchitectSystemPrompt(),
      userPrompt: buildPresentationArchitectUserPrompt({
        userPrompt,
        gameplayBlueprint: compilation.blueprint,
      }),
      schemaName: "rule_presentation_blueprint_v1",
      schema: PRESENTATION_BLUEPRINT_JSON_SCHEMA,
      reasoningEffort: "medium",
      timeoutMs: 55_000,
    });

    const validation = validatePresentationBlueprint(structured.value);
    if (!validation.ok || !validation.blueprint) {
      await serviceClient
        .from("rule_presentations")
        .update({
          status: "failed",
          diagnostics: validation.diagnostics,
          request_id: structured.requestId,
          metrics: {
            generationDurationMs: Math.round(performance.now() - startedAt),
            usage: structured.usage,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", presentationId)
        .eq("user_id", user.id);

      return jsonResponse(request, 422, {
        success: false,
        error: "La mise en scène générée n'a pas passé les contrôles de sécurité.",
        code: "PRESENTATION_VALIDATION_FAILED",
        diagnostics: validation.diagnostics,
      });
    }

    const assets: ResolvedPresentationAsset[] = [];
    const diagnostics: PresentationDiagnostic[] = [];
    for (const assetRequest of validation.blueprint.assetRequests) {
      const resolved = await resolvePresentationAsset({
        serviceClient,
        presentationId,
        request: assetRequest,
      });
      assets.push(resolved.asset);
      if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
    }

    if (assets.length > 0) {
      const rows = assets.map((asset) => ({
        presentation_id: presentationId,
        user_id: user.id,
        request_id: asset.requestId,
        visual_id: asset.visualId,
        status: asset.status,
        provider: asset.provider,
        provider_asset_id: asset.providerAssetId,
        storage_bucket: asset.storageBucket,
        storage_path: asset.storagePath,
        public_url: asset.publicUrl,
        mime_type: asset.mimeType,
        byte_size: asset.byteSize,
        sha256: asset.sha256,
        license: asset.license,
        license_url: asset.licenseUrl,
        attribution: asset.attribution,
        landing_url: asset.landingUrl,
        fallback: asset.fallback,
        metadata: {},
      }));
      const { error: assetWriteError } = await serviceClient
        .from("rule_assets")
        .upsert(rows, { onConflict: "presentation_id,request_id" });
      if (assetWriteError) throw new Error("ASSET_METADATA_WRITE_FAILED");
    }

    const status = assets.some((asset) => asset.status === "fallback")
      ? "fallback"
      : "ready";
    const generationDurationMs = Math.round(performance.now() - startedAt);
    const contentHash = await sha256Text({
      blueprint: validation.blueprint,
      assets,
    });

    const { error: updateError } = await serviceClient
      .from("rule_presentations")
      .update({
        status,
        blueprint: validation.blueprint,
        resolved_assets: assets,
        diagnostics,
        metrics: {
          generationDurationMs,
          usage: structured.usage,
          assetCount: assets.length,
          fallbackCount: assets.filter((asset) => asset.status === "fallback")
            .length,
        },
        content_hash: contentHash,
        request_id: structured.requestId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", presentationId)
      .eq("user_id", user.id);
    if (updateError) throw new Error("PRESENTATION_UPDATE_FAILED");

    const response: CompilePresentationResponse = {
      presentationId,
      status,
      model,
      requestId: structured.requestId,
      contentHash,
      blueprint: validation.blueprint,
      assets,
      diagnostics,
      generationDurationMs,
    };

    return jsonResponse(request, 200, { success: true, data: response });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "UNKNOWN";
    if (presentationId) {
      try {
        const { serviceClient, user } = await authenticateRequest(request);
        await serviceClient
          .from("rule_presentations")
          .update({
            status: "failed",
            diagnostics: [
              {
                code: "PRESENTATION_COMPILATION_FAILED",
                severity: "error",
                path: "$",
                message: "La génération visuelle a échoué sans modifier la règle de jeu.",
              },
            ],
            updated_at: new Date().toISOString(),
          })
          .eq("id", presentationId)
          .eq("user_id", user.id);
      } catch {
        // La réponse reste générique et aucun secret n'est journalisé.
      }
    }

    const unauthorized =
      errorCode === "AUTH_REQUIRED" || errorCode === "AUTH_INVALID";
    console.error("[compile-rule-presentation]", {
      code: unauthorized
        ? "AUTHENTICATION_FAILED"
        : "PRESENTATION_COMPILATION_REJECTED",
    });
    return jsonResponse(request, unauthorized ? 401 : 500, {
      success: false,
      error: unauthorized
        ? "Authentification requise."
        : "La mise en scène n'a pas pu être générée. La règle de jeu reste intacte.",
      code: unauthorized ? "AUTH_REQUIRED" : "PRESENTATION_COMPILATION_FAILED",
      retryable: !unauthorized,
    });
  }
});
