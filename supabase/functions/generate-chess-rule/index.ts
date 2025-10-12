import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { invokeChatCompletion } from "../_shared/ai-providers.ts";

const corsOptions = { methods: ["POST"] };

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
      const details = parsed.error.issues.map(issue => ({
        path: issue.path.join('.') || 'root',
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

    const systemPrompt = `Tu es un expert en règles d'échecs et en génération de configurations JSON pour un moteur de jeu d'échecs personnalisable.

Tu dois générer un objet JSON PARFAITEMENT structuré et exécutable. Voici la structure EXACTE :

{
  "ruleId": "rule_[timestamp_unique]",
  "ruleName": "Nom Court et Descriptif",
  "description": "Description détaillée de ce que fait la règle",
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

RÈGLES IMPORTANTES :
- Réponds UNIQUEMENT avec le JSON, rien d'autre
- Pas de backticks, pas de markdown
- Le JSON doit être parfaitement valide
- Génère entre 2 et 4 tags courts en français pour décrire la règle
- Sois créatif mais logique`;

    const { content: modelResponse } = await invokeChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `DESCRIPTION DE LA RÈGLE : "${prompt}"` },
      ],
      temperature: 0.7,
    });

    let ruleJson = modelResponse.trim();

    // Nettoyage du JSON
    ruleJson = ruleJson.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

    const firstBrace = ruleJson.indexOf("{");
    const lastBrace = ruleJson.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Le modèle n'a pas renvoyé de JSON valide");
    }

    const cleanedJson = ruleJson.slice(firstBrace, lastBrace + 1);
    const parsedRule = JSON.parse(cleanedJson);
    
    // Garantir un ID unique
    parsedRule.ruleId = parsedRule.ruleId || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    parsedRule.createdAt = new Date().toISOString();
    parsedRule.tags = Array.isArray(parsedRule.tags)
      ? parsedRule.tags
          .map((tag: unknown) => typeof tag === "string" ? tag.toLowerCase() : String(tag))
          .filter((tag: string) => tag.length > 0)
      : [];
    parsedRule.conditions = Array.isArray(parsedRule.conditions) ? parsedRule.conditions : [];
    parsedRule.effects = Array.isArray(parsedRule.effects) ? parsedRule.effects : [];

    return jsonResponse(req, { rule: parsedRule }, { status: 200 }, corsOptions);

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
