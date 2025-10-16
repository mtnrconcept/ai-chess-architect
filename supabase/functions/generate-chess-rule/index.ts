// supabase/functions/generate-chess-rule/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import {
  corsResponse,
  handleOptions,
  jsonResponse,
  type CorsOptions,
} from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { invokeChatCompletion, type AiProviderName } from "../_shared/ai-providers.ts";

// === CORS ===
const corsOptions: CorsOptions = {
  methods: ["POST"],                     // on n’expose que POST côté API
  allowCredentials: true,
  extraAllowedHeaders: [
    // redondant mais explicite : on documente les entêtes attendus par supabase-js
    "x-client-info",
    "apikey",
    "Authorization",
    "Prefer",
    "X-Requested-With",
    "x-csrf-token",
  ],
};

const BEST_RULE_MODELS: Partial<Record<AiProviderName, string>> = {
  lovable: "google/gemini-2.0-pro-exp",
  groq: "llama-3.1-70b-versatile",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

const QUALITY_CHECK_MODELS: Partial<Record<AiProviderName, string>> = {
  lovable: "google/gemini-2.0-pro-exp",
  groq: "llama-3.1-70b-versatile",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

// --- Schémas Zod (inchangés) ---
const conditionSchema = z.object({
  type: z.enum([
    "pieceType",
    "pieceColor",
    "turnNumber",
    "position",
    "movesThisTurn",
    "piecesOnBoard",
  ]),
  value: z.union([
    z.string().trim().min(1),
    z.number(),
    z.boolean(),
    z.array(z.string().trim().min(1)),
    z.record(z.unknown()),
  ]),
  operator: z.enum([
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "greaterOrEqual",
    "lessOrEqual",
    "contains",
    "in",
  ]),
});

const effectSchema = z.object({
  action: z.enum([
    "allowExtraMove",
    "modifyMovement",
    "addAbility",
    "restrictMovement",
    "changeValue",
    "triggerEvent",
    "allowCapture",
    "preventCapture",
  ]),
  target: z.enum(["self", "opponent", "all", "specific"]),
  parameters: z.object({
    count: z.number().int().min(0).optional(),
    property: z.string().trim().min(1).optional(),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.unknown()),
      z.record(z.unknown()),
    ]).optional(),
    duration: z.enum(["permanent", "temporary", "turns"]).optional(),
    range: z.number().int().min(0).optional(),
  }).default({}),
});

const ruleSchema = z.object({
  ruleId: z.string().trim().min(1).optional(),
  ruleName: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20),
  category: z.enum([
    "movement",
    "capture",
    "special",
    "condition",
    "victory",
    "restriction",
    "defense",
    "behavior",
  ]),
  affectedPieces: z.array(z.enum([
    "king",
    "queen",
    "rook",
    "bishop",
    "knight",
    "pawn",
    "all",
  ])).min(1),
  trigger: z.enum([
    "always",
    "onMove",
    "onCapture",
    "onCheck",
    "onCheckmate",
    "turnBased",
    "conditional",
  ]),
  conditions: z.array(conditionSchema).default([]),
  effects: z.array(effectSchema).min(1, "Au moins un effet est requis"),
  priority: z.number().int().min(0).max(100).default(1),
  isActive: z.boolean(),
  tags: z.array(z.string().trim().min(2).max(20)).min(2).max(4),
  validationRules: z.object({
    allowedWith: z.array(z.string().trim()).default([]),
    conflictsWith: z.array(z.string().trim()).default([]),
    requiredState: z.record(z.unknown()).default({}),
  }).default({ allowedWith: [], conflictsWith: [], requiredState: {} }),
});

// --- Helpers JSON tolerant ---
const normaliseUnicodeJson = (input: string) =>
  input
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u2028|\u2029/g, "");

const repairSingleQuotedJson = (input: string) => {
  let output = input;
  output = output.replace(/([\{\[,]\s*)'([^'\n\r]+?)'\s*:/g, (_m, p: string, k: string) => {
    const esc = k.replace(/"/g, '\\"');
    return `${p}"${esc}":`;
  });
  output = output.replace(/:\s*'([^'\n\r]*?)'/g, (_m, v: string) => {
    const esc = v.replace(/"/g, '\\"');
    return `: "${esc}"`;
  });
  output = output.replace(/'([^'\n\r]*?)'(?=\s*([,\]]))/g, (_m, v: string, s: string) => {
    const esc = v.replace(/"/g, '\\"');
    return `"${esc}"${s ?? ""}`;
  });
  return output;
};

const parseModelJson = (raw: string) => {
  const primary = normaliseUnicodeJson(raw);
  try {
    return JSON.parse(primary);
  } catch {
    const loose = normaliseUnicodeJson(
      primary.replace(/,\s*([}\]])/g, "$1").replace(/\s+$/g, ""),
    );
    try {
      return JSON.parse(loose);
    } catch {
      const repaired = repairSingleQuotedJson(loose);
      return JSON.parse(repaired);
    }
  }
};

// --- Prompts ---
const verificationSystemPrompt =
  'Tu es un contrôleur qualité… Réponds STRICTEMENT au format JSON: {"status":"OK"|"KO","reason":"..."}';

serve(async (req) => {
  // 1) Preflight CORS — sort immédiatement en 204
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  // 2) Uniquement POST
  if (req.method !== "POST") {
    return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
  }

  try {
    // 3) Auth côté POST uniquement
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      return jsonResponse(req, { error: authResult.error }, { status: authResult.status }, corsOptions);
    }

    // 4) Validation d’entrée
    const rawBody = await req.json().catch(() => null);
    const schema = z.object({ prompt: z.string().trim().min(10).max(800) });
    const parsed = schema.safeParse(rawBody);

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "root",
        message: issue.message,
      }));
      return jsonResponse(req, { error: "Invalid request payload", details }, { status: 400 }, corsOptions);
    }

    const prompt = parsed.data.prompt;

    // 5) Appel modèle — génération stricte JSON
    const systemPrompt = `Tu es un expert en règles... (ton texte d’origine ici, inchangé)`;

    const { content: modelResponse } = await invokeChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DESCRIPTION DE LA RÈGLE : "${prompt}"` },
      ],
      temperature: 0.7,
      preferredModels: BEST_RULE_MODELS,
    });

    let ruleJson = modelResponse.trim()
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const firstBrace = ruleJson.indexOf("{");
    const lastBrace = ruleJson.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Le modèle n'a pas renvoyé de JSON valide");
    }

    const cleanedJson = ruleJson.slice(firstBrace, lastBrace + 1);
    const parsedRule = parseModelJson(cleanedJson);

    // 6) Normalisation avant Zod
    const normalizedRuleInput = {
      ...parsedRule,
      tags: Array.isArray(parsedRule.tags) ? parsedRule.tags : [],
      conditions: Array.isArray(parsedRule.conditions) ? parsedRule.conditions : [],
      effects: Array.isArray(parsedRule.effects) ? parsedRule.effects : [],
      validationRules: parsedRule.validationRules ?? {},
    };

    const ruleValidation = ruleSchema.safeParse(normalizedRuleInput);
    if (!ruleValidation.success) {
      const details = ruleValidation.error.issues.map((issue) => ({
        path: issue.path.join(".") || "root",
        message: issue.message,
      }));
      return jsonResponse(req, { error: "La règle générée est invalide", details }, { status: 422 }, corsOptions);
    }

    const validatedRule = ruleValidation.data;
    const finalRule = {
      ...validatedRule,
      ruleId: validatedRule.ruleId || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      createdAt: new Date().toISOString(),
      tags: validatedRule.tags.map((t) => String(t).toLowerCase()).filter(Boolean),
      validationRules: {
        allowedWith: validatedRule.validationRules.allowedWith,
        conflictsWith: validatedRule.validationRules.conflictsWith,
        requiredState: validatedRule.validationRules.requiredState,
      },
    };

    // 7) Vérification de cohérence par LLM
    const { content: verificationResponse } = await invokeChatCompletion({
      messages: [
        { role: "system", content: verificationSystemPrompt },
        { role: "user", content: `PROMPT UTILISATEUR:\n${prompt}\n\nRÈGLE JSON:\n${JSON.stringify(finalRule, null, 2)}` },
      ],
      temperature: 0,
      maxOutputTokens: 400,
      preferredModels: QUALITY_CHECK_MODELS,
    });

    const verificationPayload = verificationResponse
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    let verificationResult: { status: string; reason?: string };
    try {
      verificationResult = JSON.parse(verificationPayload);
    } catch {
      return jsonResponse(
        req,
        { error: "Échec de la validation de cohérence", details: [{ path: "verification", message: "Réponse non-JSON" }] },
        { status: 502 },
        corsOptions,
      );
    }

    if (verificationResult.status !== "OK") {
      return jsonResponse(
        req,
        { error: "La règle générée n'a pas passé la validation de cohérence", details: [{ path: "verification", message: verificationResult.reason ?? "Motif non spécifié" }] },
        { status: 422 },
        corsOptions,
      );
    }

    // 8) Succès
    return jsonResponse(req, { rule: finalRule }, { status: 200 }, corsOptions);

  } catch (error) {
    console.error("Error in generate-chess-rule:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = msg.includes("429") || msg.includes("Rate limit")
      ? 429
      : msg.includes("Aucun fournisseur IA")
        ? 503
        : 500;
    return jsonResponse(req, { error: msg || "Unknown error" }, { status }, corsOptions);
  }
});
