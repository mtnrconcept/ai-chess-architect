import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, handleOptions, jsonResponse } from "../_shared/cors.ts";

const corsOptions = { methods: ["POST"] };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, corsOptions);
  }

  try {
    if (req.method !== "POST") {
      return corsResponse(req, "Method not allowed", { status: 405 }, corsOptions);
    }

    const { prompt } = await req.json();

    if (!prompt || !prompt.trim()) {
      return jsonResponse(req, { error: "Prompt is required" }, { status: 400 }, corsOptions);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `DESCRIPTION DE LA RÈGLE : "${prompt}"` }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return jsonResponse(
          req,
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429 },
          corsOptions,
        );
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const choices = Array.isArray(data?.choices) ? data.choices : [];

    if (choices.length === 0 || !choices[0]?.message) {
      throw new Error("Invalid response from AI gateway");
    }

    const message = choices[0].message;
    let rawContent: unknown = message.content;

    if (Array.isArray(rawContent)) {
      rawContent = rawContent
        .map((entry: unknown) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object" && "text" in entry) {
            const text = (entry as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("\n");
    }

    if (typeof rawContent !== "string" || !rawContent.trim()) {
      throw new Error("Réponse inattendue du modèle IA");
    }

    let ruleJson = rawContent.trim();

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
    return jsonResponse(req, { error: errorMessage }, { status: 500 }, corsOptions);
  }
});
