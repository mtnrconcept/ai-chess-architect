import { authenticateRequest } from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";
import { createStructuredResponse } from "../_shared/openai-responses.ts";
import { buildRuleArchitectSystemPrompt } from "../_shared/rule-architect-prompt.ts";
import {
  compileRuleBlueprint,
  RULE_BLUEPRINT_JSON_SCHEMA,
  sha256Hex,
} from "../_shared/rules-v2/index.ts";
import {
  classifyCompilationReplay,
  parseStaleProcessingSeconds,
  STALE_PROCESSING_FAILURE_CODE,
  type CompilationReplayState,
} from "./replay-state.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredCompilation extends CompilationReplayState {
  id: string;
  prompt_hash: string;
  model: string;
  blueprint: unknown;
  compiled_rule: unknown;
  diagnostics: unknown;
  metrics: Record<string, unknown> | null;
  content_hash: string | null;
  request_id: string | null;
}

const COMPILATION_COLUMNS = [
  "id",
  "prompt_hash",
  "model",
  "status",
  "blueprint",
  "compiled_rule",
  "diagnostics",
  "metrics",
  "content_hash",
  "request_id",
  "updated_at",
  "expires_at",
].join(",");

const readIntegerEnv = (
  name: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = Number(Deno.env.get(name));
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(raw)));
};

const replayCompilation = (
  request: Request,
  row: StoredCompilation,
  staleAfterSeconds: number,
): Response => {
  const disposition = classifyCompilationReplay(row, staleAfterSeconds);

  if (disposition.kind === "processing-active") {
    return jsonResponse(request, disposition.httpStatus, {
      success: false,
      code: disposition.code,
      error: "Cette compilation est déjà en cours.",
      retryable: disposition.retryable,
      newRequestRequired: disposition.newRequestRequired,
    });
  }

  if (disposition.kind === "processing-stale") {
    return jsonResponse(request, disposition.httpStatus, {
      success: false,
      code: disposition.code,
      error:
        "Cette réservation de compilation a expiré. Crée une nouvelle demande.",
      retryable: disposition.retryable,
      newRequestRequired: disposition.newRequestRequired,
    });
  }

  if (disposition.kind === "expired") {
    return jsonResponse(request, disposition.httpStatus, {
      success: false,
      code: disposition.code,
      error:
        "Cette demande de compilation a expiré. Crée une nouvelle demande.",
      retryable: disposition.retryable,
      newRequestRequired: disposition.newRequestRequired,
    });
  }

  if (disposition.kind === "failed") {
    return jsonResponse(request, disposition.httpStatus, {
      success: false,
      code: disposition.code,
      error:
        disposition.code === "QUOTA_EXCEEDED"
          ? "Quota de génération atteint. Réessaie après le renouvellement de la fenêtre."
          : disposition.code === STALE_PROCESSING_FAILURE_CODE
            ? "Cette réservation de compilation a expiré. Crée une nouvelle demande."
            : "Cette compilation a échoué. Crée une nouvelle demande pour réessayer.",
      retryable: disposition.retryable,
      newRequestRequired: disposition.newRequestRequired,
    });
  }

  const metrics = row.metrics ?? {};
  return jsonResponse(request, 200, {
    success: true,
    data: {
      compilationId: row.id,
      ok: row.status !== "rejected",
      blueprint: row.blueprint,
      compiledRule: row.compiled_rule,
      diagnostics: row.diagnostics,
      metrics,
      contentHash: row.content_hash,
      model: row.model,
      premiumRequested: metrics.premiumRequested === true,
      premiumGranted: metrics.premiumGranted === true,
      requestId: row.request_id,
      generationDurationMs:
        typeof metrics.generationDurationMs === "number"
          ? metrics.generationDurationMs
          : null,
      replayed: true,
      newRequestRequired: false,
    },
  });
};

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

  const startedAt = performance.now();
  let markCompilationFailed: ((failureCode: string) => Promise<void>) | null =
    null;

  try {
    const { user, userClient, serviceClient } =
      await authenticateRequest(request);

    const body = (await request.json().catch(() => null)) as {
      prompt?: unknown;
      premium?: unknown;
      requestKey?: unknown;
    } | null;

    const maxPromptChars = readIntegerEnv(
      "RULE_PROMPT_MAX_CHARS",
      4000,
      500,
      12000,
    );
    const prompt =
      typeof body?.prompt === "string"
        ? body.prompt.split(String.fromCharCode(0)).join("").trim()
        : "";
    const requestKey =
      typeof body?.requestKey === "string" ? body.requestKey : "";

    if (prompt.length < 20 || prompt.length > maxPromptChars) {
      return jsonResponse(request, 400, {
        success: false,
        error:
          "Le prompt doit contenir entre 20 et " +
          maxPromptChars +
          " caractères.",
      });
    }

    if (!UUID_PATTERN.test(requestKey)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Une clé de requête UUID valide est requise.",
      });
    }

    const premiumRequested = body?.premium === true;
    const appMetadata = user.app_metadata as Record<string, unknown>;
    const configuredPremiumUsers = new Set(
      (Deno.env.get("RULE_ARCHITECT_PREMIUM_USER_IDS") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const premiumEntitled =
      appMetadata.rule_architect_tier === "premium" ||
      appMetadata.role === "admin" ||
      appMetadata.role === "owner" ||
      appMetadata.is_admin === true ||
      configuredPremiumUsers.has(user.id);
    const premium = premiumRequested && premiumEntitled;
    const model = premium
      ? Deno.env.get("OPENAI_PREMIUM_RULE_MODEL")?.trim() || "gpt-5.6"
      : Deno.env.get("OPENAI_RULE_MODEL")?.trim() || "gpt-5.6-terra";
    const promptHash = await sha256Hex(prompt);
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const initialMetrics = {
      premiumRequested,
      premiumGranted: premium,
    };
    const staleProcessingSeconds = parseStaleProcessingSeconds(
      Deno.env.get("RULE_COMPILE_STALE_SECONDS"),
    );

    const { data: inserted, error: insertError } = await serviceClient
      .from("rule_compilations")
      .insert({
        user_id: user.id,
        prompt,
        prompt_hash: promptHash,
        model,
        status: "processing",
        blueprint: {},
        diagnostics: [],
        metrics: initialMetrics,
        request_key: requestKey,
        expires_at: expiresAt,
      })
      .select(COMPILATION_COLUMNS)
      .single();

    if (insertError || !inserted) {
      if (insertError?.code !== "23505") {
        throw new Error("La demande de compilation n'a pas pu être réservée.");
      }

      const { data: existing, error: existingError } = await serviceClient
        .from("rule_compilations")
        .select(COMPILATION_COLUMNS)
        .eq("user_id", user.id)
        .eq("request_key", requestKey)
        .single();

      if (existingError || !existing) {
        throw new Error("La compilation existante n'a pas pu être relue.");
      }

      let stored = existing as unknown as StoredCompilation;
      if (
        stored.prompt_hash !== promptHash ||
        stored.metrics?.premiumRequested !== premiumRequested
      ) {
        return jsonResponse(request, 409, {
          success: false,
          error:
            "Cette clé de requête a déjà été utilisée avec un autre contenu.",
        });
      }

      const replayDisposition = classifyCompilationReplay(
        stored,
        staleProcessingSeconds,
      );

      if (replayDisposition.kind === "processing-stale") {
        const staleUpdatedAt = new Date().toISOString();
        const { data: recovered, error: recoveryError } = await serviceClient
          .from("rule_compilations")
          .update({
            status: "failed",
            diagnostics: [
              {
                code: STALE_PROCESSING_FAILURE_CODE,
                severity: "error",
                path: "$",
                message:
                  "La réservation de compilation a dépassé sa fenêtre serveur.",
              },
            ],
            metrics: {
              ...(stored.metrics ?? {}),
              failureCode: STALE_PROCESSING_FAILURE_CODE,
            },
            updated_at: staleUpdatedAt,
          })
          .eq("id", stored.id)
          .eq("status", "processing")
          .eq("updated_at", stored.updated_at)
          .select(COMPILATION_COLUMNS)
          .maybeSingle();

        if (recoveryError) {
          throw new Error("STALE_COMPILATION_RECOVERY_FAILED");
        }

        if (recovered) {
          stored = recovered as unknown as StoredCompilation;
        } else {
          const { data: concurrentResult, error: concurrentReadError } =
            await serviceClient
              .from("rule_compilations")
              .select(COMPILATION_COLUMNS)
              .eq("id", stored.id)
              .single();

          if (concurrentReadError || !concurrentResult) {
            throw new Error("STALE_COMPILATION_RELOAD_FAILED");
          }

          stored = concurrentResult as unknown as StoredCompilation;
        }
      }

      return replayCompilation(request, stored, staleProcessingSeconds);
    }

    const insertedCompilation = inserted as unknown as StoredCompilation;
    const compilationId = insertedCompilation.id;
    markCompilationFailed = async (failureCode: string) => {
      const { error } = await serviceClient
        .from("rule_compilations")
        .update({
          status: "failed",
          diagnostics: [
            {
              code: failureCode,
              severity: "error",
              path: "$",
              message: "La compilation serveur a échoué.",
            },
          ],
          metrics: {
            ...initialMetrics,
            failureCode,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", compilationId)
        .eq("status", "processing");

      if (error) {
        console.error(
          "[compile-chess-rule] impossible de marquer la compilation en échec",
          { code: "COMPILATION_FAILURE_PERSIST_FAILED" },
        );
      }
    };

    const hourlyLimit = readIntegerEnv("RULE_COMPILE_HOURLY_LIMIT", 12, 1, 12);
    const { data: quotaAccepted, error: quotaError } = await userClient.rpc(
      "consume_rule_compile_quota",
      {
        p_limit: hourlyLimit,
        p_window_minutes: 60,
      },
    );

    if (quotaError) {
      throw new Error("Le contrôle de quota a échoué.");
    }

    if (!quotaAccepted) {
      await markCompilationFailed("QUOTA_EXCEEDED");
      markCompilationFailed = null;
      return jsonResponse(request, 429, {
        success: false,
        code: "QUOTA_EXCEEDED",
        error:
          "Quota de génération atteint. Réessaie après le renouvellement de la fenêtre.",
        retryable: false,
        newRequestRequired: true,
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY n'est pas configurée.");
    }

    const openAI = await createStructuredResponse({
      apiKey,
      model,
      systemPrompt: buildRuleArchitectSystemPrompt(),
      userPrompt: prompt,
      schemaName: "rule_blueprint_v2",
      schema: RULE_BLUEPRINT_JSON_SCHEMA as unknown as Record<string, unknown>,
      reasoningEffort: premium ? "high" : "medium",
    });

    const result = compileRuleBlueprint(openAI.value);
    const contentHash =
      result.ok && result.compiledRule
        ? await sha256Hex({
            blueprint: result.blueprint,
            compiledRule: result.compiledRule,
          })
        : null;
    const generationDurationMs = Math.round(performance.now() - startedAt);
    const metrics = {
      ...result.metrics,
      ...initialMetrics,
      generationDurationMs,
      usage: openAI.usage,
      openAIResponseId: openAI.responseId,
    };

    const { data: updated, error: updateError } = await serviceClient
      .from("rule_compilations")
      .update({
        status: result.ok ? "validated" : "rejected",
        blueprint: result.blueprint ?? openAI.value,
        compiled_rule: result.compiledRule,
        diagnostics: result.diagnostics,
        metrics,
        content_hash: contentHash,
        request_id: openAI.requestId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", compilationId)
      .eq("status", "processing")
      .select("id")
      .single();

    if (updateError || !updated) {
      throw new Error("La compilation n'a pas pu être enregistrée.");
    }

    markCompilationFailed = null;
    return jsonResponse(request, 200, {
      success: true,
      data: {
        compilationId,
        ok: result.ok,
        blueprint: result.blueprint,
        compiledRule: result.compiledRule,
        diagnostics: result.diagnostics,
        metrics: result.metrics,
        contentHash,
        model,
        premiumRequested,
        premiumGranted: premium,
        requestId: openAI.requestId,
        generationDurationMs,
        replayed: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";

    if (markCompilationFailed) {
      await markCompilationFailed("GENERATION_FAILED");
    }

    const status =
      message === "AUTH_REQUIRED" || message === "AUTH_INVALID" ? 401 : 500;

    console.error("[compile-chess-rule]", {
      code: status === 401 ? "AUTHENTICATION_FAILED" : "COMPILATION_FAILED",
    });

    return jsonResponse(request, status, {
      success: false,
      code: status === 401 ? "AUTHENTICATION_FAILED" : "COMPILATION_FAILED",
      error:
        status === 401
          ? "Authentification requise."
          : "La génération de la règle a échoué.",
      retryable: false,
      newRequestRequired: status !== 401,
    });
  }
});
