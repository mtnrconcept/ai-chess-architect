// --- generate-chess-rule/index.ts ---
// Générateur de règles d'échecs via Lovable AI
// Point d'entrée : https://{project}.supabase.co/functions/v1/generate-chess-rule

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are an expert chess rule generator. Generate COMPLETE, PLAYABLE, and BALANCED chess rules in JSON format.

CRITICAL RULES:
1. You MUST respond ONLY with valid JSON
2. NO explanatory text, NO markdown code blocks
3. Generate COMPLETE rules with UI actions AND logic effects - NEVER return empty arrays
4. If the request is vague, create a reasonable interpretation that is PLAYABLE
5. ALWAYS include at least ONE ui.actions entry and ONE logic.effects entry
6. Rules should be BALANCED - not too powerful, not too weak
7. Include appropriate cooldowns, conditions, and limitations
8. Use clear, descriptive names and hints in French for better UX

Required structure (ALL fields are mandatory):
{
  "meta": {
    "ruleId": "unique-kebab-case-id",
    "ruleName": "Nom Clair en Français",
    "category": "movement|attack|defense|special|terrain|stealth|spawn",
    "description": "Description précise en français de l'effet de la règle",
    "tags": ["tag1", "tag2"],
    "version": "1.0.0",
    "isActive": true
  },
  "scope": {
    "affectedPieces": ["pawn", "rook", "bishop", "knight", "queen", "king"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_action_name",
      "label": "Nom du Bouton",
      "hint": "Description de l'action pour le joueur",
      "icon": "🎯",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["pawn"],
        "phase": "main",
        "cooldownOk": true,
        "conditions": ["piece.isAlive", "!status.frozen"]
      },
      "targeting": {
        "mode": "tile|piece|none",
        "validTilesProvider": "provider.enemiesInRange|provider.emptyTiles"
      },
      "consumesTurn": true|false,
      "cooldown": {
        "perPiece": 2,
        "perGame": 5
      }
    }]
  },
  "logic": {
    "effects": [{
      "id": "effect-name",
      "when": "ui.special_action_name",
      "if": ["cooldown.ready", "ctx.hasTargetTile", "target.isEmpty"],
      "do": [
        {"action": "vfx.play", "params": {"sprite": "effect_name", "tile": "$targetTile"}},
        {"action": "audio.play", "params": {"id": "sound_name"}},
        {"action": "piece.move", "params": {"pieceId": "$pieceId", "to": "$targetTile"}},
        {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_action_name", "turns": 2}},
        {"action": "turn.end"}
      ],
      "onFail": [
        {"action": "ui.toast", "params": {"message": "Action impossible"}}
      ]
    }]
  },
  "assets": {
    "icon": "🎯",
    "color": "#FFD700",
    "sfx": {
      "onTrigger": "whoosh",
      "onSuccess": "success",
      "onFail": "error"
    }
  },
  "state": {
    "namespace": "rules.uniqueName",
    "initial": {}
  },
  "parameters": {}
}

DESIGN PRINCIPLES:
- Cooldowns: Use 1-3 turns for powerful effects, 0 for weak utility
- Targeting: Be specific - "enemiesInRange", "emptyTilesAdjacent", "alliedPieces"
- Conditions: Always check piece.isAlive, cooldown.ready, appropriate game state
- Visual feedback: Include vfx.play and audio.play for player satisfaction
- Balance: Strong effects should have high cooldowns or strict conditions
- French labels: Use clear, engaging French for all user-facing text

BALANCED EXAMPLES:

Input: "Pions qui sautent par-dessus les pièces"
Output: {"meta":{"ruleId":"pawn-leap","ruleName":"Saut de Pion","category":"movement","description":"Les pions peuvent sauter par-dessus une pièce adjacente une fois tous les 3 tours","tags":["movement","pawn","leap"],"version":"1.0.0","isActive":true},"scope":{"affectedPieces":["pawn"],"sides":["white","black"]},"ui":{"actions":[{"id":"special_pawn_leap","label":"Sauter","hint":"Sauter par-dessus une pièce adjacente","icon":"🦘","availability":{"requiresSelection":true,"pieceTypes":["pawn"],"phase":"main","cooldownOk":true,"conditions":["piece.isAlive","!status.frozen"]},"targeting":{"mode":"tile","validTilesProvider":"provider.leapTargets"},"consumesTurn":true,"cooldown":{"perPiece":3}}]},"logic":{"effects":[{"id":"pawn-leap-effect","when":"ui.special_pawn_leap","if":["cooldown.ready","ctx.hasTargetTile","target.isEmpty","piece.isTypeInScope"],"do":[{"action":"vfx.play","params":{"sprite":"leap_arc","from":"$pieceTile","to":"$targetTile"}},{"action":"audio.play","params":{"id":"leap"}},{"action":"piece.move","params":{"pieceId":"$pieceId","to":"$targetTile"}},{"action":"cooldown.set","params":{"pieceId":"$pieceId","actionId":"special_pawn_leap","turns":3}},{"action":"ui.toast","params":{"message":"Saut réussi!"}},{"action":"turn.end"}],"onFail":[{"action":"ui.toast","params":{"message":"Impossible de sauter ici"}}]}]},"assets":{"icon":"🦘","color":"#4CAF50","sfx":{"onTrigger":"whoosh","onSuccess":"leap","onFail":"error"}},"state":{"namespace":"rules.pawnLeap","initial":{}},"parameters":{"leapRange":2}}

Input: "Tours qui tirent des missiles"
Output: {"meta":{"ruleId":"rook-missiles","ruleName":"Missiles de Tour","category":"attack","description":"Les tours peuvent tirer des missiles sur les ennemis en ligne de vue, avec un temps de recharge","tags":["attack","ranged","rook"],"version":"1.0.0","isActive":true},"scope":{"affectedPieces":["rook"],"sides":["white","black"]},"ui":{"actions":[{"id":"special_fire_missile","label":"Tirer Missile","hint":"Tire un missile sur une pièce ennemie en ligne de vue","icon":"🚀","availability":{"requiresSelection":true,"pieceTypes":["rook"],"phase":"main","cooldownOk":true,"conditions":["piece.isAlive","!status.stunned"]},"targeting":{"mode":"piece","validTilesProvider":"provider.enemiesInLineOfSight"},"consumesTurn":true,"cooldown":{"perPiece":2}}]},"logic":{"effects":[{"id":"fire-missile","when":"ui.special_fire_missile","if":["cooldown.ready","ctx.hasTargetPiece","target.isEnemy","piece.hasLineOfSight"],"do":[{"action":"vfx.play","params":{"sprite":"missile_trail","from":"$pieceTile","to":"$targetTile"}},{"action":"audio.play","params":{"id":"explosion"}},{"action":"piece.capture","params":{"pieceId":"$targetPieceId"}},{"action":"vfx.play","params":{"sprite":"explosion","tile":"$targetTile"}},{"action":"cooldown.set","params":{"pieceId":"$pieceId","actionId":"special_fire_missile","turns":2}},{"action":"ui.toast","params":{"message":"Missile tiré!"}},{"action":"turn.end"}],"onFail":[{"action":"ui.toast","params":{"message":"Cible hors de portée"}}]}]},"assets":{"icon":"🚀","color":"#FF4444","sfx":{"onTrigger":"launch","onSuccess":"explosion","onFail":"error"}},"state":{"namespace":"rules.rookMissiles","initial":{}},"parameters":{"range":8}}

Now generate a COMPLETE, PLAYABLE, BALANCED rule with BOTH ui.actions and logic.effects populated.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();
    const prompt = body.prompt ?? "";
    const guidedAnswers = body.guidedAnswers ?? [];

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return new Response(JSON.stringify({ error: "invalid_prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Construire un prompt enrichi avec les réponses guidées
    let enrichedPrompt = prompt;
    if (guidedAnswers.length > 0) {
      enrichedPrompt += "\n\nDétails précisés:\n";
      guidedAnswers.forEach((answer: { question: string; choice: string }) => {
        enrichedPrompt += `- ${answer.question} → ${answer.choice}\n`;
      });
    }

    const response = await fetch(LOVABLE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Generate a chess rule JSON for: "${enrichedPrompt}"\n\nRemember: Respond ONLY with valid JSON, no other text.` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limits exceeded, please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Payment required, please add funds to your Lovable AI workspace.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content ?? "";

    if (typeof content !== "string" || content.trim().length === 0) {
      console.error("Empty model response:", result);
      return new Response(
        JSON.stringify({ ok: false, error: "empty_model_response" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Detect if model is asking for clarification instead of generating JSON
    const lowerContent = content.toLowerCase();
    if (
      (content.includes("?") && content.length < 200) ||
      lowerContent.includes("quel type") ||
      lowerContent.includes("what kind") ||
      lowerContent.includes("could you") ||
      lowerContent.includes("pouvez-vous")
    ) {
      console.error("Model asking for clarification:", content.slice(0, 200));
      return new Response(
        JSON.stringify({
          ok: false,
          status: "need_info",
          error: "Model is asking for clarification instead of generating JSON",
          message: content.slice(0, 300),
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const extracted = extractJsonFromContent(content);
    if (!extracted) {
      return new Response(
        JSON.stringify({ ok: false, error: "json_not_found_in_response" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let rule: unknown;
    try {
      rule = JSON.parse(extracted);
    } catch (parseError) {
      console.error("JSON parse failed. Raw model response:", content.slice(0, 500));
      console.error("Extracted candidate:", extracted?.slice(0, 500));
      console.error("Parse error:", parseError);
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: "unable_to_parse_model_response",
          details: parseError instanceof Error ? parseError.message : String(parseError),
          rawResponse: content.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (
      !rule ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      !("meta" in rule)
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_rule_meta" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rawModelResponse = {
      model: MODEL,
      content,
      response: result,
    } as const;

    const normalizedPrompt = typeof prompt === "string" ? prompt : "";

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          status: "ready",
          rule: rule as Record<string, unknown>,
          choices: [{ message: { content } }], // For compatibility with ossClient
          validation: null,
          dryRun: null,
          prompt: normalizedPrompt,
          promptHash: null,
          correlationId: null,
          provider: MODEL,
          rawModelResponse,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("generate-chess-rule error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function extractJsonFromContent(content: string): string | null {
  const trimmed = content.trim();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    return sanitizeJsonString(fencedMatch[1]);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = trimmed.slice(firstBrace, lastBrace + 1);
  return sanitizeJsonString(candidate);
}

function sanitizeJsonString(value: string): string {
  return value
    .replace(/^\ufeff/, "")
    .replace(/```/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}
