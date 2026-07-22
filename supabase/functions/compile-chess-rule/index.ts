import { authenticateRequest } from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";
import { createStructuredResponse } from "../_shared/openai-responses.ts";
import {
  PromptSecurityError,
  requireSafeRulePrompt,
  requireSafeSignedRuleCompilerPrompt,
} from "../_shared/prompt-security.ts";
import { verifyGuidanceToken } from "../_shared/guidance-token.ts";
import {
  extractLegacyGuidanceSessionId,
  legacyGuidanceCompatEnabled,
  recoverLegacyGuidanceSelections,
  requireUsableLegacyGuidanceSession,
  type LegacyGuidanceSessionRow,
} from "../_shared/legacy-guidance-compat.ts";
import { buildRuleArchitectSystemPrompt } from "../_shared/rule-architect-prompt.ts";
import { normalizeRuleBlueprintCandidate } from "../_shared/rule-blueprint-normalizer.ts";
import {
  buildRuleBlueprintRepairPrompt,
  resolveRuleBlueprintInitialTimeout,
  resolveRuleBlueprintRepairTimeout,
  resolveRuleCoverageAuditTimeout,
} from "../_shared/rule-blueprint-repair.ts";
import {
  buildRuleCoverageAuditPrompt,
  buildRuleCoverageAuditSystemPrompt,
  buildSignedGuidanceCompilation,
  evaluateRuleCoverage,
  RULE_COVERAGE_AUDIT_SCHEMA,
  type RuleCoverageAssessment,
} from "../_shared/rule-coverage.ts";
import {
  compileRuleBlueprint,
  RULE_BLUEPRINT_JSON_SCHEMA,
  sha256Hex,
  type RuleDiagnostic,
} from "../_shared/rules-v2/index.ts";
import {
  classifyCompilationReplay,
  classifyRequestEnvelopeReplay,
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

interface CompileRequestBody {
  prompt?: unknown;
  premium?: unknown;
  requestKey?: unknown;
  guidanceToken?: unknown;
  guidanceSelections?: unknown;
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
      coverage: metrics.coverage ?? null,
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
  const safeFailureMetrics: Record<string, unknown> = {};
  let markCompilationFailed: ((failureCode: string) => Promise<void>) | null =
    null;

  try {
    const { user, userClient, serviceClient } =
      await authenticateRequest(request);

    const rawRequestEnvelope = await request.text();
    if (rawRequestEnvelope.length < 2 || rawRequestEnvelope.length > 128_000) {
      throw new Error("GUIDANCE_REQUEST_ENVELOPE_INVALID");
    }
    let body: CompileRequestBody | null = null;
    try {
      body = JSON.parse(rawRequestEnvelope) as CompileRequestBody | null;
    } catch {
      throw new Error("GUIDANCE_REQUEST_ENVELOPE_INVALID");
    }

    const requestKey =
      typeof body?.requestKey === "string" ? body.requestKey : "";

    if (!UUID_PATTERN.test(requestKey)) {
      return jsonResponse(request, 400, {
        success: false,
        error: "Une clé de requête UUID valide est requise.",
      });
    }

    const premiumRequested = body?.premium === true;
    const requestEnvelopeFingerprint = await sha256Hex({
      domain: "rule-compile-request-envelope-v1",
      body: rawRequestEnvelope,
    });
    const staleProcessingSeconds = parseStaleProcessingSeconds(
      Deno.env.get("RULE_COMPILE_STALE_SECONDS"),
    );

    const replayStored = async (
      initialStored: StoredCompilation,
    ): Promise<Response> => {
      let stored = initialStored;
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
    };

    const { data: preExisting, error: preExistingError } = await serviceClient
      .from("rule_compilations")
      .select(COMPILATION_COLUMNS)
      .eq("user_id", user.id)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (preExistingError) {
      throw new Error("COMPILATION_REPLAY_LOOKUP_FAILED");
    }
    if (preExisting) {
      const stored = preExisting as unknown as StoredCompilation;
      const envelopeMatch = classifyRequestEnvelopeReplay(
        stored.metrics,
        requestEnvelopeFingerprint,
        premiumRequested,
      );
      if (envelopeMatch === "verified-conflict") {
        return jsonResponse(request, 409, {
          success: false,
          error:
            "Cette clé de requête a déjà été utilisée avec un autre contenu.",
        });
      }
      if (envelopeMatch === "verified-match") {
        return await replayStored(stored);
      }
      // Pre-fingerprint historical rows continue through the signed guidance
      // and prompt-hash verification below.
    }

    let signedGuidance;
    let guidanceSelections = body?.guidanceSelections;
    const guidanceTokenProvided =
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      Object.prototype.hasOwnProperty.call(body, "guidanceToken");
    if (guidanceTokenProvided && typeof body?.guidanceToken !== "string") {
      throw new Error("GUIDANCE_TOKEN_INVALID");
    }
    if (typeof body?.guidanceToken === "string") {
      // Canonical clients keep the existing stateless signed-token path.
      signedGuidance = await verifyGuidanceToken({
        token: body.guidanceToken,
        userId: user.id,
      });
    } else {
      if (!legacyGuidanceCompatEnabled()) {
        throw new Error("GUIDANCE_LEGACY_COMPAT_DISABLED");
      }
      // The production 9fe465 client only forwards its rendered prompt. Accept
      // it exclusively when it carries a server-issued compatibility marker;
      // arbitrary free text never reaches the compiler or the model.
      const legacyPrompt = typeof body?.prompt === "string" ? body.prompt : "";
      const legacySessionId = extractLegacyGuidanceSessionId(legacyPrompt);
      const nowIso = new Date().toISOString();
      const { data: session, error: sessionError } = await serviceClient
        .from("rule_guidance_compat_sessions")
        .select("id,user_id,guidance_token,created_at,expires_at")
        .eq("id", legacySessionId)
        .eq("user_id", user.id)
        .gt("expires_at", nowIso)
        .maybeSingle();
      if (sessionError) {
        throw new Error("GUIDANCE_LEGACY_SESSION_LOOKUP_FAILED");
      }
      const storedToken = requireUsableLegacyGuidanceSession({
        row: session as LegacyGuidanceSessionRow | null,
        sessionId: legacySessionId,
        userId: user.id,
      });
      signedGuidance = await verifyGuidanceToken({
        token: storedToken,
        userId: user.id,
      });
      guidanceSelections = recoverLegacyGuidanceSelections({
        prompt: legacyPrompt,
        sessionId: legacySessionId,
        guidance: signedGuidance.guidance,
      });
    }
    const signedCompilation = buildSignedGuidanceCompilation({
      originalPrompt: signedGuidance.originalPrompt,
      guidance: signedGuidance.guidance,
      selections: guidanceSelections,
    });
    const promptSecurity = requireSafeSignedRuleCompilerPrompt(
      signedCompilation.compilerPrompt,
    );
    const safePrompt = promptSecurity.sanitizedPrompt;
    const intentContract = signedCompilation.contract;
    const originalPromptSecurity = requireSafeRulePrompt(
      intentContract.originalPrompt,
    );
    intentContract.originalPrompt = originalPromptSecurity.sanitizedPrompt;

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
      ? Deno.env.get("OPENAI_PREMIUM_RULE_MODEL")?.trim() || "gpt-5.6-sol"
      : Deno.env.get("OPENAI_RULE_MODEL")?.trim() || "gpt-5.6-terra";
    const promptHash = await sha256Hex({
      prompt: safePrompt,
      intentContract,
      selections: signedCompilation.selections,
    });
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const initialMetrics = {
      premiumRequested,
      premiumGranted: premium,
      requestEnvelopeFingerprint,
    };

    const { data: inserted, error: insertError } = await serviceClient
      .from("rule_compilations")
      .insert({
        user_id: user.id,
        prompt: safePrompt,
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

      const stored = existing as unknown as StoredCompilation;
      const envelopeMatch = classifyRequestEnvelopeReplay(
        stored.metrics,
        requestEnvelopeFingerprint,
        premiumRequested,
      );
      if (
        envelopeMatch === "verified-conflict" ||
        (envelopeMatch === "legacy-unverified" &&
          (stored.prompt_hash !== promptHash ||
            stored.metrics?.premiumRequested !== premiumRequested))
      ) {
        return jsonResponse(request, 409, {
          success: false,
          error:
            "Cette clé de requête a déjà été utilisée avec un autre contenu.",
        });
      }
      return await replayStored(stored);
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
            ...safeFailureMetrics,
            generationDurationMs: Math.round(performance.now() - startedAt),
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

    const initialTimeoutMs = resolveRuleBlueprintInitialTimeout(
      performance.now() - startedAt,
    );
    if (initialTimeoutMs === null) {
      throw new Error("RULE_COMPILE_BUDGET_EXHAUSTED");
    }
    safeFailureMetrics.aiBudget = { initialTimeoutMs };

    let openAI = await createStructuredResponse({
      apiKey,
      model,
      systemPrompt: buildRuleArchitectSystemPrompt(),
      userPrompt: safePrompt,
      schemaName: "rule_blueprint_v2",
      schema: RULE_BLUEPRINT_JSON_SCHEMA as unknown as Record<string, unknown>,
      reasoningEffort: premium ? "high" : "medium",
      ruleArchitectPromptSource: "signed-guidance",
      timeoutMs: initialTimeoutMs,
      signal: request.signal,
    });

    let normalized = normalizeRuleBlueprintCandidate(openAI.value, safePrompt);
    let result = compileRuleBlueprint(normalized.value);
    const initialCompilationUsage = openAI.usage;
    const repairPrompt = result.ok
      ? null
      : buildRuleBlueprintRepairPrompt(safePrompt, result.diagnostics);
    let repairDiagnosticCodes: string[] = [];
    let repairUsage: unknown = null;
    let repairAttempted = false;
    let repairTimeoutMs: number | null = null;

    safeFailureMetrics.compilationRepair = {
      attempted: false,
      skippedForBudget: false,
      initialDiagnosticCodes: repairPrompt?.diagnosticCodes ?? [],
      initialUsage: initialCompilationUsage,
    };

    if (repairPrompt) {
      repairDiagnosticCodes = repairPrompt.diagnosticCodes;
      repairTimeoutMs = resolveRuleBlueprintRepairTimeout(
        performance.now() - startedAt,
      );
      if (repairTimeoutMs !== null) {
        repairAttempted = true;
        safeFailureMetrics.compilationRepair = {
          attempted: true,
          skippedForBudget: false,
          timeoutMs: repairTimeoutMs,
          initialDiagnosticCodes: repairDiagnosticCodes,
          initialUsage: initialCompilationUsage,
        };
        const repaired = await createStructuredResponse({
          apiKey,
          model,
          systemPrompt: buildRuleArchitectSystemPrompt(),
          userPrompt: repairPrompt.prompt,
          schemaName: "rule_blueprint_v2",
          schema: RULE_BLUEPRINT_JSON_SCHEMA as unknown as Record<
            string,
            unknown
          >,
          reasoningEffort: "medium",
          ruleArchitectPromptSource: "signed-guidance",
          managedRuleAsset: openAI.managedAsset,
          timeoutMs: repairTimeoutMs,
          signal: request.signal,
        });
        repairUsage = repaired.usage;
        openAI = repaired;
        normalized = normalizeRuleBlueprintCandidate(
          repaired.value,
          safePrompt,
        );
        result = compileRuleBlueprint(normalized.value);
        safeFailureMetrics.compilationRepair = {
          attempted: true,
          completed: true,
          skippedForBudget: false,
          timeoutMs: repairTimeoutMs,
          initialDiagnosticCodes: repairDiagnosticCodes,
          initialUsage: initialCompilationUsage,
          repairUsage,
          remainingDiagnosticCodes: result.ok
            ? []
            : Array.from(
                new Set(
                  result.diagnostics.map((diagnostic) => diagnostic.code),
                ),
              ).slice(0, 20),
        };
      } else {
        safeFailureMetrics.compilationRepair = {
          attempted: false,
          skippedForBudget: true,
          timeoutMs: null,
          initialDiagnosticCodes: repairDiagnosticCodes,
          initialUsage: initialCompilationUsage,
        };
      }
    }
    let coverage: RuleCoverageAssessment | null = null;
    let coverageDiagnostics: RuleDiagnostic[] = [];
    let coverageUsage: unknown = null;
    let coverageResponseId: string | null = null;
    let coverageRequestId: string | null = null;

    if (result.ok && result.blueprint) {
      const auditTimeoutMs = resolveRuleCoverageAuditTimeout(
        performance.now() - startedAt,
      );
      if (auditTimeoutMs === null) {
        coverageDiagnostics = [
          {
            code: "COVERAGE_BUDGET_EXHAUSTED",
            severity: "error",
            path: "$.coverage",
            message:
              "Le budget serveur restant ne permet pas un audit de couverture sûr.",
          },
        ];
      } else {
        safeFailureMetrics.coverageAudit = {
          attempted: true,
          timeoutMs: auditTimeoutMs,
        };
        const auditModel =
          Deno.env.get("OPENAI_RULE_AUDIT_MODEL")?.trim() || model;
        const audit = await createStructuredResponse({
          apiKey,
          model: auditModel,
          systemPrompt: buildRuleCoverageAuditSystemPrompt(),
          userPrompt: buildRuleCoverageAuditPrompt({
            contract: intentContract,
            blueprint: result.blueprint,
          }),
          schemaName: "rule_coverage_audit_v2",
          schema: RULE_COVERAGE_AUDIT_SCHEMA as unknown as Record<
            string,
            unknown
          >,
          reasoningEffort: premium ? "medium" : "low",
          timeoutMs: auditTimeoutMs,
          signal: request.signal,
        });
        const evaluated = evaluateRuleCoverage({
          contract: intentContract,
          blueprint: result.blueprint,
          audit: audit.value,
        });
        coverage = evaluated.assessment;
        coverageDiagnostics = evaluated.diagnostics;
        coverageUsage = audit.usage;
        coverageResponseId = audit.responseId;
        coverageRequestId = audit.requestId;
        safeFailureMetrics.coverageAudit = {
          attempted: true,
          completed: true,
          timeoutMs: auditTimeoutMs,
          usage: audit.usage,
        };
      }
    }

    const diagnostics = [...result.diagnostics, ...coverageDiagnostics];
    const finalOk = result.ok && coverage?.complete === true;
    const contentHash =
      finalOk && result.compiledRule
        ? await sha256Hex({
            blueprint: result.blueprint,
            compiledRule: result.compiledRule,
          })
        : null;
    const generationDurationMs = Math.round(performance.now() - startedAt);
    const intentContractProof = {
      ...intentContract,
      originalPrompt: "[redacted]",
      originalPromptHash: await sha256Hex({
        originalPrompt: intentContract.originalPrompt,
      }),
    };
    const metrics = {
      ...result.metrics,
      ...initialMetrics,
      generationDurationMs,
      usage: openAI.usage,
      openAIResponseId: openAI.responseId,
      coverage,
      intentContract: intentContractProof,
      coverageContractVersion: intentContract.version,
      coverageUsage,
      coverageResponseId,
      coverageRequestId,
      normalizedFields: normalized.normalizedFields,
      compilationRepair: {
        initialTimeoutMs,
        attempted: repairAttempted,
        skippedForBudget: repairPrompt !== null && !repairAttempted,
        timeoutMs: repairTimeoutMs,
        initialDiagnosticCodes: repairDiagnosticCodes,
        initialUsage: initialCompilationUsage,
        repairUsage,
        remainingDiagnosticCodes: result.ok
          ? []
          : Array.from(
              new Set(result.diagnostics.map((diagnostic) => diagnostic.code)),
            ).slice(0, 20),
      },
    };

    const { data: updated, error: updateError } = await serviceClient
      .from("rule_compilations")
      .update({
        status: finalOk ? "validated" : "rejected",
        blueprint: result.blueprint ?? normalized.value,
        compiled_rule: result.compiledRule,
        diagnostics,
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
        ok: finalOk,
        blueprint: result.blueprint,
        compiledRule: result.compiledRule,
        diagnostics,
        metrics: result.metrics,
        coverage,
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

    const authFailure =
      message === "AUTH_REQUIRED" || message === "AUTH_INVALID";
    const guidanceConfigurationFailure =
      message === "GUIDANCE_SIGNING_SECRET_MISSING" ||
      message === "GUIDANCE_SIGNING_SECRET_INVALID";
    const invalidInput =
      error instanceof PromptSecurityError ||
      (!guidanceConfigurationFailure && message.startsWith("GUIDANCE_")) ||
      message.startsWith("SIGNED_GUIDANCE_");
    const status = authFailure ? 401 : invalidInput ? 400 : 500;
    const code = authFailure
      ? "AUTHENTICATION_FAILED"
      : invalidInput
        ? "RULE_INPUT_REJECTED"
        : "COMPILATION_FAILED";

    console.error("[compile-chess-rule]", {
      code,
    });

    return jsonResponse(request, status, {
      success: false,
      code,
      error: authFailure
        ? "Authentification requise."
        : invalidInput
          ? "La demande de règle ou son contrat contient des données invalides."
          : "La génération de la règle a échoué.",
      retryable: false,
      newRequestRequired: !authFailure,
    });
  }
});
