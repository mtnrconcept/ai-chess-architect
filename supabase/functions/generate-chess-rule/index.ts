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

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type GenerateRuleReq = {
  prompt?: string;
  conversation?: ConversationMessage[];
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

type NeedInfoQuestion = {
  question: string;
  options: string[];
  allowMultiple?: boolean;
};

type NeedInfoResult = {
  status: "need_info";
  questions: NeedInfoQuestion[];
  prompt: string;
  promptHash: string;
  correlationId: string;
  rawModelResponse: JsonRecord;
  provider?: string;
};

type ReadyResult = {
  status: "ready";
  rule: RuleCandidate;
  validation: ReturnType<typeof validateRuleJSON>;
  dryRun?: Awaited<ReturnType<typeof dryRunRule>> | null;
  prompt: string;
  promptHash: string;
  correlationId: string;
  rawModelResponse: JsonRecord;
  provider?: string;
};

type GenerateRuleResponse = {
  ok: true;
  result: NeedInfoResult | ReadyResult;
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

  const trimmedPrompt =
    typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const locale = payload.options?.locale ?? DEFAULT_LOCALE;
  const shouldDryRun = payload.options?.dryRun ?? true;
  const correlationId = generateCorrelationId();
  const conversation = sanitizeConversation(payload.conversation);

  const promptForContext = selectPromptForContext(trimmedPrompt, conversation);
  if (!promptForContext) {
    return jsonResponse(
      {
        ok: false,
        error: "validation_failed",
        details: ["prompt ou conversation utilisateur requis"],
      },
      422,
    );
  }

  try {
    const promptFingerprint = await promptHash(promptForContext);
    const modelResult = await generateRuleWithModel({
      conversation,
      board: payload.board,
      options: payload.options,
      prompt: promptForContext,
    });

    if (modelResult.status === "need_info") {
      const response: GenerateRuleResponse = {
        ok: true,
        result: {
          status: "need_info",
          questions: modelResult.questions,
          prompt: promptForContext,
          promptHash: promptFingerprint,
          correlationId,
          rawModelResponse: modelResult.raw as JsonRecord,
          provider: modelResult.provider,
        },
      };

      trackEvent("generate_chess_rule.need_info", {
        correlationId,
        promptHash: promptFingerprint,
        locale,
        provider: modelResult.provider,
      });

      return jsonResponse(response, 200);
    }

    const normalizedRule = await normalizeRule(modelResult.rule, {
      prompt: promptForContext,
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
        status: "ready",
        rule: normalizedRule,
        validation,
        dryRun: dryRunResult,
        prompt: promptForContext,
        promptHash: promptFingerprint,
        correlationId,
        rawModelResponse: modelResult.raw as JsonRecord,
        provider: modelResult.provider,
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

  if (body.prompt != null && typeof body.prompt !== "string") {
    issues.push("prompt: doit être une chaîne si présent");
  } else if (typeof body.prompt === "string") {
    const trimmed = body.prompt.trim();
    if (trimmed.length > 0 && trimmed.length < MIN_PROMPT_LENGTH) {
      issues.push(`prompt: au moins ${MIN_PROMPT_LENGTH} caractères`);
    }
    if (trimmed.length > MAX_PROMPT_LENGTH) {
      issues.push(`prompt: maximum ${MAX_PROMPT_LENGTH} caractères`);
    }
  }

  if (body.conversation != null && !Array.isArray(body.conversation)) {
    issues.push("conversation: doit être un tableau de messages");
  }

  if (Array.isArray(body.conversation)) {
    body.conversation.forEach((message, index) => {
      if (!message || typeof message !== "object") {
        issues.push(`conversation[${index}]: objet requis`);
        return;
      }

      const role = (message as Record<string, unknown>).role;
      const content = (message as Record<string, unknown>).content;

      if (role !== "user" && role !== "assistant") {
        issues.push(
          `conversation[${index}].role: doit être "user" ou "assistant"`,
        );
      }
      if (typeof content !== "string") {
        issues.push(`conversation[${index}].content: doit être une chaîne`);
      }
    });
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

async function generateRuleWithModel(params: {
  conversation: ConversationMessage[];
  board: GenerateRuleReq["board"];
  options: GenerateRuleReq["options"];
  prompt: string;
}) {
  const { conversation, board, options, prompt } = params;
  const temperature = normalizeTemperature(options?.temperature);
  const boardSummary = summariseBoard(board);
  const systemContent = buildSystemPrompt({
    locale: options?.locale ?? DEFAULT_LOCALE,
    boardSummary,
  });

  const conversationMessages =
    conversation.length > 0
      ? conversation
      : [{ role: "user" as const, content: prompt }];

  const { content } = await invokeChatCompletion({
    messages: [
      { role: "system" as const, content: systemContent },
      ...conversationMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
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

  const parsedRecord: JsonRecord = parsed as JsonRecord;
  const providerValue = parsedRecord["provider"];
  const provider =
    typeof providerValue === "string" ? providerValue : undefined;

  const statusValue = parsedRecord["status"];
  const status = typeof statusValue === "string" ? statusValue : undefined;

  if (status === "need_info") {
    const questionsRaw = parsedRecord["questions"];
    const questions = parseNeedInfoQuestions(questionsRaw);

    if (questions.length === 0) {
      throw new Error("model_response_missing_questions");
    }

    return {
      status: "need_info" as const,
      questions,
      raw: parsedRecord,
      provider,
    };
  }

  if (status !== "ready") {
    throw new Error("model_response_missing_status");
  }

  let parsedRecordForRule: JsonRecord = parsedRecord;
  if (
    !("rule" in parsedRecordForRule) &&
    !("rule_json" in parsedRecordForRule)
  ) {
    parsedRecordForRule = { rule: parsedRecordForRule } as JsonRecord;
  }

  const ruleEntry = parsedRecordForRule["rule"];
  const ruleJsonEntry = parsedRecordForRule["rule_json"];
  const ruleCandidate = (ruleEntry ?? ruleJsonEntry) as unknown;
  if (!isRecord(ruleCandidate)) {
    throw new Error("model_response_missing_rule");
  }

  return {
    status: "ready" as const,
    rule: ruleCandidate,
    raw: parsedRecordForRule,
    provider,
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

type SystemPromptContext = {
  locale: string;
  boardSummary: string;
};

function buildSystemPrompt(context: SystemPromptContext): string {
  const basePrompt = `Tu es RuleForge, un assistant qui conçoit des variantes d'échecs.
Tu dois analyser l'historique de conversation fourni par l'utilisateur.
Locale préférée: ${context.locale}
${context.boardSummary}

Quand les informations sont insuffisantes pour décrire précisément la règle, tu dois répondre STRICTEMENT avec un JSON de la forme:
{
  "status": "need_info",
  "questions": [
    {
      "question": "question complémentaire 1",
      "options": ["option A", "option B", "option C"],
      "allowMultiple": false
    }
  ]
}
Chaque objet "questions" DOIT contenir au moins trois "options" claires et exclusives (ajoute "Autre (précisez)" si nécessaire).
"allowMultiple" est optionnel et ne doit être présent que si plusieurs réponses peuvent être sélectionnées.
Pose au maximum trois questions courtes et ciblées à la fois, en évitant les répétitions et en tenant compte des réponses déjà apportées.

Une fois que tu disposes de tous les détails nécessaires, tu dois répondre STRICTEMENT avec un JSON conforme au schéma suivant.

RÈGLES CRITIQUES DE FORMAT:
1. Si la règle nécessite une action UI (bouton), "ui.actions" doit contenir des objets avec:
   - "id": string commençant par "special_" (ex: "special_teleport")
   - "label": string (ex: "Téléporter")
   Sinon, omets complètement la section "ui".

2. Dans "logic.effects":
   - "when": DOIT commencer par "ui.", "lifecycle." ou "status." (ex: "ui.special_teleport" ou "lifecycle.onCapture")
   - "do": DOIT être un array d'objets, même s'il n'y a qu'une seule action
   - Chaque action dans "do" DOIT avoir:
     * "action": au format "namespace.action" (ex: "piece.teleport", "vfx.play", "turn.end")
     * "params": objet optionnel de paramètres

EXEMPLE MINIMAL (sans action UI):
{
  "status": "ready",
  "rule": {
    "meta": {
      "ruleId": "double_move_pawns",
      "ruleName": "Pions rapides",
      "description": "Les pions peuvent se déplacer deux fois par tour",
      "category": "movement"
    },
    "scope": {
      "affectedPieces": ["pawn"]
    },
    "logic": {
      "effects": [
        {
          "id": "double_move",
          "when": "lifecycle.onMoveComplete",
          "do": [
            { "action": "piece.grantExtraMove", "params": { "pieceType": "pawn" } }
          ]
        }
      ]
    }
  }
}

EXEMPLE AVEC ACTION UI:
{
  "status": "ready",
  "rule": {
    "meta": {
      "ruleId": "teleport_rule",
      "ruleName": "Téléportation",
      "description": "Les pions peuvent se téléporter",
      "category": "special"
    },
    "scope": {
      "affectedPieces": ["pawn"]
    },
    "ui": {
      "actions": [
        {
          "id": "special_teleport",
          "label": "Téléporter",
          "icon": "teleport",
          "hint": "Choisir une destination"
        }
      ]
    },
    "logic": {
      "effects": [
        {
          "id": "teleport_effect",
          "when": "ui.special_teleport",
          "do": [
            { "action": "piece.teleport", "params": { "tile": "$targetTile" } },
            { "action": "vfx.play", "params": { "animation": "teleport" } },
            { "action": "turn.end" }
          ]
        }
      ]
    }
  }
}

ACTIONS DISPONIBLES (namespace.action):
- piece.teleport, piece.capture, piece.spawn, piece.move, piece.morph, piece.duplicate
- vfx.play, vfx.spawnDecal, vfx.playAnimation
- audio.play
- tile.setTrap, tile.clearTrap
- status.add, status.remove
- turn.end
- state.set, state.inc
- ui.toast
- board.areaEffect

Ne mets jamais de markdown ni de texte hors JSON. Suis strictement ces formats.`;

  return basePrompt;
}

function parseNeedInfoQuestions(raw: unknown): NeedInfoQuestion[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const questions: NeedInfoQuestion[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const questionValue = record["question"];
    const optionsValue = record["options"];

    if (typeof questionValue !== "string") {
      continue;
    }

    const trimmedQuestion = questionValue.trim();
    if (!trimmedQuestion) {
      continue;
    }

    const options = Array.isArray(optionsValue)
      ? optionsValue
          .map((option) =>
            typeof option === "string" ? option.trim() : undefined,
          )
          .filter(
            (option): option is string =>
              typeof option === "string" && option.length > 0,
          )
      : [];

    if (options.length === 0) {
      continue;
    }

    const allowMultipleValue = record["allowMultiple"];
    const allowMultiple =
      typeof allowMultipleValue === "boolean" ? allowMultipleValue : undefined;

    questions.push({
      question: trimmedQuestion,
      options,
      allowMultiple,
    });
  }

  return questions;
}

function sanitizeConversation(
  conversation: GenerateRuleReq["conversation"],
): ConversationMessage[] {
  if (!Array.isArray(conversation)) return [];

  const sanitized: ConversationMessage[] = [];

  for (const entry of conversation) {
    if (!entry || typeof entry !== "object") continue;
    const message = entry as Record<string, unknown>;
    const role = message.role;
    const content = message.content;

    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;

    const trimmed = content.trim();
    if (!trimmed) continue;

    sanitized.push({ role, content: trimmed });
  }

  return sanitized;
}

function selectPromptForContext(
  trimmedPrompt: string,
  conversation: ConversationMessage[],
): string {
  if (trimmedPrompt.length >= MIN_PROMPT_LENGTH) {
    return trimmedPrompt;
  }

  const userMessages = conversation
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0);

  if (userMessages.length === 0) {
    return trimmedPrompt;
  }

  const lastUserMessage = userMessages[userMessages.length - 1];
  return lastUserMessage;
}

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
