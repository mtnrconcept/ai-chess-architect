// supabase/functions/generate-chess-rule/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, preflightIfOptions } from "../_shared/cors.ts";
import {
  invokeChatCompletion,
  MissingApiKeyError,
} from "../_shared/ai-providers.ts";
import { enrichRule } from "../_shared/enrichment.ts";
import { dryRunRule } from "../_shared/dryRunner.ts";
import { validateRuleJSON } from "../_shared/validation.ts";
import {
  generateCorrelationId,
  generateRuleId,
  promptHash,
} from "../_shared/identity.ts";
import { trackEvent } from "../_shared/telemetry.ts";

type GenerateRuleReq = {
  prompt: string;
  board?: {
    tiles?: unknown;
    pieces?: unknown;
    occupancy?: unknown;
  };
  options?: {
    locale?: string;
    dryRun?: boolean;
    temperature?: number;
  };
};

type JsonRecord = Record<string, unknown>;

type RuleCandidate = JsonRecord & {
  meta?: JsonRecord;
};

type GenerateRuleResponse = {
  ok: true;
  result: {
    rule: RuleCandidate;
    validation: ReturnType<typeof validateRuleJSON>;
    dryRun?: Awaited<ReturnType<typeof dryRunRule>> | null;
    promptHash: string;
    correlationId: string;
    rawModelResponse: JsonRecord;
  };
};

type GenerateRuleErrorResponse = {
  ok: false;
  error: string;
  details?: unknown;
};

const DEFAULT_LOCALE = "fr-CH";
const MIN_PROMPT_LENGTH = 8;
const MAX_PROMPT_LENGTH = 2000;

serve(async (req) => {
  const preflight = preflightIfOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const ctype = req.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_content_type",
        details: "Use application/json",
      },
      415,
    );
  }

  let payload: GenerateRuleReq;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_json",
        details: "Body must be valid JSON",
      },
      422,
    );
  }

  const validationIssues = validateRequestPayload(payload);
  if (validationIssues.length > 0) {
    return jsonResponse(
      {
        ok: false,
        error: "validation_failed",
        details: validationIssues,
      },
      422,
    );
  }

  const trimmedPrompt = payload.prompt.trim();
  const locale = payload.options?.locale ?? DEFAULT_LOCALE;
  const shouldDryRun = payload.options?.dryRun ?? true;
  const correlationId = generateCorrelationId();

  try {
    const promptFingerprint = await promptHash(trimmedPrompt);
    const modelResult = await generateRuleWithModel(trimmedPrompt, payload);
    const normalizedRule = await normalizeRule(modelResult.rule, {
      prompt: trimmedPrompt,
      locale,
      fallbackRuleId: generateRuleId(),
    });

    const validation = validateRuleJSON(normalizedRule);
    if (!validation.valid) {
      const response: GenerateRuleErrorResponse = {
        ok: false,
        error: "rule_validation_failed",
        details: validation.errors,
      };
      return jsonResponse(response, 422);
    }

    let dryRunResult: Awaited<ReturnType<typeof dryRunRule>> | null = null;
    if (shouldDryRun) {
      dryRunResult = await dryRunRule(normalizedRule);
      if (!dryRunResult.success) {
        const response: GenerateRuleErrorResponse = {
          ok: false,
          error: "rule_dry_run_failed",
          details: dryRunResult.errors,
        };
        return jsonResponse(response, 422);
      }
    }

    const response: GenerateRuleResponse = {
      ok: true,
      result: {
        rule: normalizedRule,
        validation,
        dryRun: dryRunResult,
        promptHash: promptFingerprint,
        correlationId,
        rawModelResponse: modelResult.raw as JsonRecord,
      },
    };

    trackEvent("generate_chess_rule.succeeded", {
      correlationId,
      promptHash: promptFingerprint,
      locale,
      dryRun: shouldDryRun,
      provider: modelResult.provider,
    });

    return jsonResponse(response, 200);
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      const details =
        `Missing ${error.envVar} for provider "${error.provider}". ` +
        "Configure the required secret or update AI_PROVIDER to a provider with valid credentials.";

      trackEvent("generate_chess_rule.failed", {
        correlationId,
        error: error.message,
        code: error.code,
        provider: error.provider,
      });

      return jsonResponse(
        {
          ok: false,
          error: "ai_provider_unavailable",
          details,
        },
        503,
      );
    }

    const message = error instanceof Error ? error.message : String(error);

    trackEvent("generate_chess_rule.failed", {
      correlationId,
      error: message,
    });

    return jsonResponse(
      {
        ok: false,
        error: "generation_failed",
        details: message,
      },
      500,
    );
  }
});

function validateRequestPayload(body: GenerateRuleReq): string[] {
  const issues: string[] = [];

  if (typeof body !== "object" || body === null) {
    return ["payload: object requis"];
  }

  if (typeof body.prompt !== "string") {
    issues.push("prompt: string requis");
  } else {
    const trimmed = body.prompt.trim();
    if (trimmed.length < MIN_PROMPT_LENGTH) {
      issues.push(`prompt: au moins ${MIN_PROMPT_LENGTH} caractères`);
    }
    if (trimmed.length > MAX_PROMPT_LENGTH) {
      issues.push(`prompt: maximum ${MAX_PROMPT_LENGTH} caractères`);
    }
  }

  if (body.board) {
    if (body.board.tiles && !Array.isArray(body.board.tiles)) {
      issues.push("board.tiles: doit être un tableau si présent");
    }
    if (body.board.pieces && typeof body.board.pieces !== "object") {
      issues.push("board.pieces: doit être un objet si présent");
    }
    if (body.board.occupancy && typeof body.board.occupancy !== "object") {
      issues.push("board.occupancy: doit être un objet si présent");
    }
  }

  if (body.options) {
    if (body.options.locale && typeof body.options.locale !== "string") {
      issues.push("options.locale: doit être une chaîne");
    }
    if (
      body.options.dryRun != null &&
      typeof body.options.dryRun !== "boolean"
    ) {
      issues.push("options.dryRun: doit être un booléen");
    }
    if (
      body.options.temperature != null &&
      typeof body.options.temperature !== "number"
    ) {
      issues.push("options.temperature: doit être un nombre");
    }
  }

  return issues;
}

async function generateRuleWithModel(prompt: string, payload: GenerateRuleReq) {
  const temperature = normalizeTemperature(payload.options?.temperature);
  const boardSummary = summariseBoard(payload.board);
  const userMessage = buildUserMessage(prompt, boardSummary, payload.options);

  const { content } = await invokeChatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature,
    maxOutputTokens: 1400,
    forceJson: true,
    preferredModels: {
      openai: "gpt-4o-mini",
      gemini: "gemini-1.5-pro",
      groq: "llama-3.1-70b-versatile",
      lovable: "google/gemini-2.5-flash",
    },
  });

  const extracted = extractJsonObject(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`unable_to_parse_model_response: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("model_response_empty");
  }

  let parsedRecord: JsonRecord = parsed as JsonRecord;

  if (!("rule" in parsedRecord) && !("rule_json" in parsedRecord)) {
    // Some prompts might return the rule directly
    parsedRecord = { rule: parsedRecord } as JsonRecord;
  }

  const ruleCandidate = (parsedRecord as any).rule ?? (parsedRecord as any).rule_json;
  if (!isRecord(ruleCandidate)) {
    throw new Error("model_response_missing_rule");
  }

  return {
    rule: ruleCandidate,
    raw: parsedRecord,
    provider: typeof (parsedRecord as any).provider === "string" ? (parsedRecord as any).provider : undefined,
  };
}

async function normalizeRule(
  rule: RuleCandidate,
  context: { prompt: string; locale: string; fallbackRuleId: string },
) {
  const safeRule: RuleCandidate = { ...rule };
  const meta = toRecord(safeRule.meta ?? {});

  const ruleId =
    typeof meta.ruleId === "string" && meta.ruleId.trim().length > 0
      ? meta.ruleId.trim()
      : context.fallbackRuleId;
  const ruleName =
    typeof meta.ruleName === "string" && meta.ruleName.trim().length > 0
      ? meta.ruleName.trim().slice(0, 100)
      : buildRuleNameFromPrompt(context.prompt);
  const description =
    typeof meta.description === "string" && meta.description.trim().length > 0
      ? meta.description.trim().slice(0, 500)
      : context.prompt.slice(0, 500);
  const category =
    typeof meta.category === "string" && meta.category.trim().length > 0
      ? meta.category.trim()
      : inferCategoryFromPrompt(context.prompt);

  const normalizedMeta = {
    ...meta,
    ruleId,
    ruleName,
    description,
    category,
    locale: context.locale,
  };

  const enriched = enrichRule(
    {
      ...safeRule,
      meta: normalizedMeta,
    },
    context.prompt,
    ruleId,
  );

  return enriched;
}

function normalizeTemperature(raw: number | undefined): number {
  if (typeof raw !== "number" || Number.isNaN(raw)) return 0.6;
  const clamped = Math.max(0, Math.min(2, raw));
  return Math.round(clamped * 100) / 100;
}

function summariseBoard(board: GenerateRuleReq["board"] | undefined): string {
  if (!board) return "Aucun contexte de plateau fourni.";
  try {
    const { tiles, pieces, occupancy } = board;
    const summary = {
      tiles: Array.isArray(tiles) ? `array(${tiles.length})` : typeof tiles,
      pieces: typeof pieces,
      occupancy: typeof occupancy,
    };
    return `Contexte plateau: ${JSON.stringify(summary)}`;
  } catch {
    return "Contexte plateau indisponible.";
  }
}

function buildUserMessage(
  prompt: string,
  boardSummary: string,
  options: GenerateRuleReq["options"],
): string {
  const locale = options?.locale ?? DEFAULT_LOCALE;
  return [
    `Locale préférée: ${locale}`,
    boardSummary,
    "Instruction utilisateur:",
    prompt.trim(),
    "Respecte scrupuleusement le format JSON demandé.",
  ].join("\n\n");
}

const SYSTEM_PROMPT = `Tu es RuleForge, un assistant qui conçoit des variantes d'échecs.
Tu dois répondre STRICTEMENT avec un objet JSON conforme au schéma suivant:
{
  "rule": {
    "meta": {
      "ruleId": "string",
      "ruleName": "string",
      "description": "string",
      "category": "capture | defense | movement | special | behavior | terrain | upgrade | vip | ai-generated"
    },
    "scope": {
      "affectedPieces": string[]
    },
    "logic": {
      "effects": Array<{
        "id": string,
        "when": string,
        "do": Array<{ "action": string, "params"?: Record<string, unknown> }>
      }>
    },
    "ui"?: { "actions"?: unknown[] },
    "assets"?: Record<string, unknown>,
    "state"?: Record<string, unknown>
  }
}
Ne mets jamais de markdown ni de texte hors JSON.`;

function extractJsonObject(content: string): string {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return "{}";

  const withoutBackticks = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "");

  const firstBrace = withoutBackticks.indexOf("{");
  const lastBrace = withoutBackticks.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return withoutBackticks;
  }
  return withoutBackticks.slice(firstBrace, lastBrace + 1);
}

function toRecord(value: unknown): JsonRecord {
  if (isRecord(value)) {
    return value;
  }
  return {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildRuleNameFromPrompt(prompt: string): string {
  const base = prompt.trim().split(" ").slice(0, 4).join(" ");
  const sanitized = base.replace(/[^a-zA-ZÀ-ÿ0-9\s'-]/g, "").trim();
  if (!sanitized) return "Règle spéciale";
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

function inferCategoryFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("roi") || lower.includes("reine")) return "vip";
  if (
    lower.includes("capture") ||
    lower.includes("détruire") ||
    lower.includes("attaque")
  )
    return "capture";
  if (
    lower.includes("défense") ||
    lower.includes("bouclier") ||
    lower.includes("protéger")
  )
    return "defense";
  if (
    lower.includes("déplacer") ||
    lower.includes("mouvement") ||
    lower.includes("teleport")
  )
    return "movement";
  if (
    lower.includes("terrain") ||
    lower.includes("case") ||
    lower.includes("zone")
  )
    return "terrain";
  if (lower.includes("amélior")) return "upgrade";
  if (lower.includes("comporte") || lower.includes("intelligence"))
    return "behavior";
  return "ai-generated";
}
