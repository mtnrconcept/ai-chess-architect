// supabase/functions/generate-chess-rule/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { corsResponse, handleOptions, jsonResponse, type CorsOptions } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { invokeChatCompletion, type AiProviderName } from "../_shared/ai-providers.ts";

// --- CORS options (identiques à ma version précédente) ---
const corsOptions: CorsOptions = {
  methods: ["POST"],
  allowCredentials: true,
  extraAllowedHeaders: ["x-client-info", "apikey", "Authorization", "Prefer", "X-Requested-With", "x-csrf-token"],
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

// --- Schémas (identiques) ---
const conditionSchema = z.object({
  type: z.enum(["pieceType", "pieceColor", "turnNumber", "position", "movesThisTurn", "piecesOnBoard"]),
  value: z.union([z.string().trim().min(1), z.number(), z.boolean(), z.array(z.string().trim().min(1)), z.record(z.unknown())]),
  operator: z.enum(["equals", "notEquals", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual", "contains", "in"]),
});

const effectSchema = z.object({
  action: z.enum(["allowExtraMove", "modifyMovement", "addAbility", "restrictMovement", "changeValue", "triggerEvent", "allowCapture", "preventCapture"]),
  target: z.enum(["self", "opponent", "all", "specific"]),
  parameters: z.object({
    count: z.number().int().min(0).optional(),
    property: z.string().trim().min(1).optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown())]).optional(),
    duration: z.enum(["permanent", "temporary", "turns"]).optional(),
    range: z.number().int().min(0).optional(),
  }).default({}),
});

const ruleSchema = z.object({
  ruleId: z.string().trim().min(1).optional(),
  ruleName: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20),
  category: z.enum(["movement", "capture", "special", "condition", "victory", "restriction", "defense", "behavior"]),
  affectedPieces: z.array(z.enum(["king", "queen", "rook", "bishop", "knight", "pawn", "all"])).min(1),
  trigger: z.enum(["always", "onMove", "onCapture", "onCheck", "onCheckmate", "turnBased", "conditional"]),
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

// --- Helpers JSON tolerant (identiques) ---
const normaliseUnicodeJson = (input: string) =>
  input
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u2028|\u2029/g, "");

const repairSingleQuotedJson = (input: string) => {
  let output = input;
  output = output.replace(/([\{\[,]\s*)'([^'\n\r]+?)'\s*:/g, (_m, p: string, k: string) => `${p}"${k.replace(/"/g, '\\"')}":`);
  output = output.replace(/:\s*'([^'\n\r]*?)'/g, (_m, v: string) => `: "${v.replace(/"/g, '\\"')}"`);
  output = output.replace(/'([^'\n\r]*?)'(?=\s*([,\]]))/g, (_m, v: string, s: string) => `"${v.replace(/"/g, '\\"')}"${s ?? ""}`);
  return output;
};

const parseModelJson = (raw: string) => {
  const primary = normaliseUnicodeJson(raw);
  try {
    return JSON.parse(primary);
  } catch {
    const loose = normaliseUnicodeJson(primary.replace(/,\s*([}\]])/g, "$1").replace(/\s+$/g, ""));
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
  'Tu es un contrôleur qualité. Réponds STRICTEMENT {"status":"OK"|"KO","reason":"..."}';

const systemPrompt =
  `Tu es un expert en règles d'échecs... (le bloc détaillé que tu avais déjà).
RÈGLES IMPORTANTES :
- Réponds UNIQUEMENT avec le JSON, rien d'autre
- Pas de backticks, pas de markdown
- Le JSON doit être parfaitement valide
- Tags FR, 2–4 éléments, etc.`;

// --- Fallback: normaliser une sortie non-JSON en JSON strict ---
async function coerceToJsonWithLLM(nonJson: string, expectedShapeHint: string): Promise<string> {
  const { content } = await invokeChatCompletion({
    forceJson: true,                            // << important
    temperature: 0,
    maxOutputTokens: 600,
    preferredModels: BEST_RULE_MODELS,
    messages: [
      { role: "system", content: "Transforme le contenu suivant en un UNIQUE objet JSON valide conforme à la structure donnée. Réponds strictement en JSON." },
      { role: "user", content: `STRUCTURE ATTENDUE:\n${expectedShapeHint}\n\nCONTENU A CONVERTIR:\n${nonJson}` },
    ],
  });
  return content.trim();
}

function extractJsonSlice(text: string): string | null {
  // Tente d’extraire la première et dernière accolade équilibrées
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function redactForLog(s: string, max = 800): string {
  const t = s.replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…[truncated]` : t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req, corsOptions);
  if (req.method !== "POST") return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);

  try {
    // Auth
    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      return jsonResponse(req, { error: authResult.error }, { status: authResult.status }, corsOptions);
    }

    // Input
    const rawBody = await req.json().catch(() => null);
    const schema = z.object({ prompt: z.string().trim().min(10).max(800) });
    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ path: i.path.join(".") || "root", message: i.message }));
      return jsonResponse(req, { error: "Invalid request payload", details }, { status: 400 }, corsOptions);
    }
    const prompt = parsed.data.prompt;

    // 1) Appel LLM en JSON-mode
    const { content: modelResponse } = await invokeChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DESCRIPTION DE LA RÈGLE : "${prompt}"` },
      ],
      temperature: 0.7,
      maxOutputTokens: 900,
      preferredModels: BEST_RULE_MODELS,
      forceJson: true,                         // << NEW
    });

    // 2) Extraction/Nettoyage
    let candidate = modelResponse.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    let jsonSlice = extractJsonSlice(candidate);

    // 3) Fallback 1: si aucune accolade trouvée, on re-demande une conversion stricte
    if (!jsonSlice) {
      console.warn("[generate-chess-rule] No braces in primary modelResponse. Sample:", redactForLog(candidate));
      const shape = `{
  "ruleId": "rule_<slug>_v1",
  "ruleName": "string",
  "description": "string",
  "category": "movement|capture|special|condition|victory|restriction|defense|behavior",
  "affectedPieces": ["king|queen|rook|bishop|knight|pawn|all"],
  "trigger": "always|onMove|onCapture|onCheck|onCheckmate|turnBased|conditional",
  "conditions": [ { "type": "...", "value": "...", "operator": "..." } ],
  "effects": [ { "action": "...", "target": "...", "parameters": {} } ],
  "priority": 1,
  "isActive": true,
  "tags": ["a","b"],
  "validationRules": { "allowedWith": [], "conflictsWith": [], "requiredState": {} }
}`;
      const coerced = await coerceToJsonWithLLM(candidate, shape);
      candidate = coerced;
      jsonSlice = extractJsonSlice(candidate);
    }

    // 4) Fallback 2: dernière chance — si toujours rien, répondre 502 explicite
    if (!jsonSlice) {
      return jsonResponse(
        req,
        {
          error: "Le modèle n’a pas renvoyé de JSON exploitable après coercition",
          details: [{ path: "modelResponse", message: redactForLog(candidate) }],
        },
        { status: 502 },
        corsOptions,
      );
    }

    // 5) Parsing tolérant
    const parsedRule = parseModelJson(jsonSlice);

    // 6) Normalisation + Validation Zod
    const normalizedRuleInput = {
      ...parsedRule,
      tags: Array.isArray(parsedRule.tags) ? parsedRule.tags : [],
      conditions: Array.isArray(parsedRule.conditions) ? parsedRule.conditions : [],
      effects: Array.isArray(parsedRule.effects) ? parsedRule.effects : [],
      validationRules: parsedRule.validationRules ?? {},
    };

    const ruleValidation = ruleSchema.safeParse(normalizedRuleInput);
    if (!ruleValidation.success) {
      const details = ruleValidation.error.issues.map((i) => ({ path: i.path.join(".") || "root", message: i.message }));
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

    // 7) Vérif de cohérence
    const { content: verificationResponse } = await invokeChatCompletion({
      messages: [
        { role: "system", content: verificationSystemPrompt },
        { role: "user", content: `PROMPT UTILISATEUR:\n${prompt}\n\nRÈGLE JSON:\n${JSON.stringify(finalRule, null, 2)}` },
      ],
      temperature: 0,
      maxOutputTokens: 300,
      preferredModels: QUALITY_CHECK_MODELS,
      forceJson: true, // le validateur doit aussi parler JSON
    });

    let ver = verificationResponse.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const verSlice = extractJsonSlice(ver) ?? ver;
    let verificationResult: { status: string; reason?: string };
    try {
      verificationResult = JSON.parse(verSlice);
    } catch {
      return jsonResponse(
        req,
        { error: "Échec de la validation de cohérence", details: [{ path: "verification", message: redactForLog(ver) }] },
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

    return jsonResponse(req, { rule: finalRule }, { status: 200 }, corsOptions);

  } catch (error) {
    console.error("Error in generate-chess-rule:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status =
      msg.includes("429") || msg.includes("Rate limit") ? 429 :
      msg.includes("Aucun fournisseur IA") ? 503 : 500;
    return jsonResponse(req, { error: msg || "Unknown error" }, { status }, corsOptions);
  }
});
