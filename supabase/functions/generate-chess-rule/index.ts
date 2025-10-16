import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { invokeChatCompletion, type AiProviderName } from "../_shared/ai-providers.ts";

const corsOptions = { methods: ["POST"] };

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

const normaliseUnicodeJson = (input: string) =>
  input
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2028|\u2029/g, '');

const repairSingleQuotedJson = (input: string) => {
  let output = input;

  output = output.replace(/([\{\[,]\s*)'([^'\n\r]+?)'\s*:/g, (_match, prefix: string, key: string) => {
    const escapedKey = key.replace(/"/g, '\\"');
    return `${prefix}"${escapedKey}":`;
  });

  output = output.replace(/:\s*'([^'\n\r]*?)'/g, (_match, value: string) => {
    const escapedValue = value.replace(/"/g, '\\"');
    return `: "${escapedValue}"`;
  });

  output = output.replace(/'([^'\n\r]*?)'(?=\s*([,\]]))/g, (_match, value: string, suffix: string) => {
    const escapedValue = value.replace(/"/g, '\\"');
    return `"${escapedValue}"${suffix ?? ''}`;
  });

  return output;
};

const parseModelJson = (raw: string) => {
  const primary = normaliseUnicodeJson(raw);

  try {
    return JSON.parse(primary);
  } catch (_primaryError) {
    const looseBase = normaliseUnicodeJson(
      primary.replace(/,\s*([}\]])/g, '$1').replace(/\s+$/g, ''),
    );

    try {
      return JSON.parse(looseBase);
    } catch (_looseError) {
      const repaired = repairSingleQuotedJson(looseBase);
      return JSON.parse(repaired);
    }
  }
};

const verificationSystemPrompt =
  "Tu es un contrÃ´leur qualitÃ© chargÃ© de vÃ©rifier que la rÃ¨gle JSON fournie rÃ©pond exactement au besoin dÃ©crit. " +
  "Analyse la cohÃ©rence, la correspondance du thÃ¨me, des conditions et des effets. RÃ©ponds STRICTEMENT au format JSON suivant: " +
  '{"status":"OK"|"KO","reason":"Explication concise en franÃ§ais"}. Si la rÃ¨gle ne correspond pas, explique pourquoi dans "reason".';

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  try {
    if (req.method !== "POST") {
      return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
    }

    const authResult = await authenticateRequest(req);
    if (!authResult.success) {
      return jsonResponse(req, { error: authResult.error }, { status: authResult.status }, corsOptions);
    }

    const rawBody = await req.json().catch(() => null);
    const schema = z.object({ prompt: z.string().trim().min(10).max(800) });
    const parsed = schema.safeParse(rawBody);

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "root",
        message: issue.message,
      }));
      return jsonResponse(
        req,
        { error: "Invalid request payload", details },
        { status: 400 },
        corsOptions,
      );
    }

    const prompt = parsed.data.prompt;

    const systemPrompt =
      `Tu es un expert en rÃ¨gles d'Ã©checs et en gÃ©nÃ©ration de configurations JSON pour un moteur de jeu d'Ã©checs personnalisable.

Tu dois gÃ©nÃ©rer un objet JSON PARFAITEMENT structurÃ© et exÃ©cutable. Voici la structure EXACTE :

{
  "ruleId": "rule_[timestamp_unique]",
  "ruleName": "Nom Court et Descriptif",
  "description": "Description dÃ©taillÃ©e de ce que fait la rÃ¨gle",
  "category": "movement|capture|special|condition|victory|restriction|defense|behavior",
  "affectedPieces": ["king"|"queen"|"rook"|"bishop"|"knight"|"pawn"|"all"],
  "trigger": "always|onMove|onCapture|onCheck|onCheckmate|turnBased|conditional",
  "conditions": [
    {
      "type": "pieceType|pieceColor|turnNumber|position|movesThisTurn|piecesOnBoard",
      "value": "valeur",
      "operator": "equals|notEquals|greaterThan|lessThan|greaterOrEqual|lessOrEqual|contains|in"
    }
  ],
  "effects": [
    {
      "action": "allowExtraMove|modifyMovement|addAbility|restrictMovement|changeValue|triggerEvent|allowCapture|preventCapture",
      "target": "self|opponent|all|specific",
      "parameters": {
        "count": 1,
        "property": "nom",
        "value": "valeur",
        "duration": "permanent|temporary|turns",
        "range": 1
      }
    }
  ],
  "priority": 1,
  "isActive": true,
  "tags": ["mot-cle-1", "mot-cle-2"],
  "validationRules": {
    "allowedWith": [],
    "conflictsWith": [],
    "requiredState": {}
  }
}

RÃˆGLES IMPORTANTES :
- RÃ©ponds UNIQUEMENT avec le JSON, rien d'autre
- Pas de backticks, pas de markdown
- Le JSON doit Ãªtre parfaitement valide
- GÃ©nÃ¨re entre 2 et 4 tags courts en franÃ§ais pour dÃ©crire la rÃ¨gle
- Sois crÃ©atif mais logique`;

    const { content: modelResponse } = await invokeChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DESCRIPTION DE LA RÃˆGLE : "${prompt}"` },
      ],
      temperature: 0.7,
      preferredModels: BEST_RULE_MODELS,
    });

    let ruleJson = modelResponse.trim();

    // Nettoyage du JSON
    ruleJson = ruleJson.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

    const firstBrace = ruleJson.indexOf("{");
    const lastBrace = ruleJson.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Le modÃ¨le n'a pas renvoyÃ© de JSON valide");
    }

    const cleanedJson = ruleJson.slice(firstBrace, lastBrace + 1);
    const parsedRule = parseModelJson(cleanedJson);

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
      return jsonResponse(
        req,
        { error: "La rÃ¨gle gÃ©nÃ©rÃ©e est invalide", details },
        { status: 422 },
        corsOptions,
      );
    }

    const validatedRule = ruleValidation.data;

    const finalRule = {
      ...validatedRule,
      ruleId: validatedRule.ruleId || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      createdAt: new Date().toISOString(),
      tags: validatedRule.tags
        .map((tag) => tag.toLowerCase())
        .filter((tag) => tag.length > 0),
      validationRules: {
        allowedWith: validatedRule.validationRules.allowedWith,
        conflictsWith: validatedRule.validationRules.conflictsWith,
        requiredState: validatedRule.validationRules.requiredState,
      },
    };

    const verificationMessages = [
      { role: "system", content: verificationSystemPrompt },
      {
        role: "user",
        content: `PROMPT UTILISATEUR:\n${prompt}\n\nRÃˆGLE JSON:\n${JSON.stringify(finalRule, null, 2)}`,
      },
    ];

    const { content: verificationResponse } = await invokeChatCompletion({
      messages: verificationMessages,
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
        {
          error: "Ã‰chec de la validation de cohÃ©rence",
          details: [
            {
              path: "verification",
              message: "La rÃ©ponse du vÃ©rificateur n'est pas un JSON valide",
            },
          ],
        },
        { status: 502 },
        corsOptions,
      );
    }

    if (verificationResult.status !== "OK") {
      return jsonResponse(
        req,
        {
          error: "La rÃ¨gle gÃ©nÃ©rÃ©e n'a pas passÃ© la validation de cohÃ©rence",
          details: [
            {
              path: "verification",
              message: verificationResult.reason || "Motif non spÃ©cifiÃ©",
            },
          ],
        },
        { status: 422 },
        corsOptions,
      );
    }

    return jsonResponse(req, { rule: finalRule }, { status: 200 }, corsOptions);
  } catch (error) {
    console.error("Error in generate-chess-rule:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const normalizedMessage = errorMessage || "Unknown error";
    const status = normalizedMessage.includes("429") || normalizedMessage.includes("Rate limit")
      ? 429
      : normalizedMessage.includes("Aucun fournisseur IA")
        ? 503
        : 500;
    return jsonResponse(req, { error: normalizedMessage }, { status }, corsOptions);
  }
});

