// --- generate-chess-rule/index.ts ---
// Générateur de règles d'échecs via Lovable AI (robuste + validation stricte + CORS propre)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/* =========================
   Config
   ========================= */
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

// Autoriser plusieurs origines, utile en dev/staging/prod
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://ton-domaine.app",
  "*", // fallback permissif — retire-le si tu veux un contrôle strict
] as const;

/* =========================
   CORS Helpers
   ========================= */
function pickOrigin(origin: string | null) {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes("*")) return origin;
  return ALLOWED_ORIGINS.includes(origin as any) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin: string | null) {
  const allowOrigin = pickOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function badRequest(reason: string, origin: string | null) {
  return json({ error: "invalid_initial_prompt", reason }, 400, origin);
}

/* =========================
   Validation & Sanitize
   ========================= */
function isNonEmptyString(x: unknown, min = 1, max = 4000): x is string {
  return typeof x === "string" && x.trim().length >= min && x.length <= max;
}

function sanitizePrompt(p: string): string {
  // Nettoyage des espaces et normalisation simple
  return p.replace(/\s+/g, " ").trim();
}

type GuidedAnswer = { question: string; choice: string };

function validateGuidedAnswers(x: unknown): GuidedAnswer[] | null {
  if (x == null) return [];
  if (!Array.isArray(x)) return null;
  const out: GuidedAnswer[] = [];
  for (const item of x) {
    if (
      typeof item === "object" &&
      item !== null &&
      isNonEmptyString((item as any).question, 1, 500) &&
      isNonEmptyString((item as any).choice, 1, 500)
    ) {
      out.push({ question: (item as any).question, choice: (item as any).choice });
    } else {
      return null;
    }
  }
  return out;
}

/* =========================
   Prompt système (ta version + quelques garanties)
   ========================= */
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

/* =========================
   Serve
   ========================= */
serve(async (req) => {
  const origin = req.headers.get("Origin");

  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Méthode
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  // Secret
  if (!LOVABLE_API_KEY) {
    return json({ error: "LOVABLE_API_KEY not configured" }, 500, origin);
  }

  // Content-Type
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return badRequest("Content-Type must be 'application/json'.", origin);
  }

  // Parsing & validation
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("Invalid JSON body.", origin);
  }

  if (typeof raw !== "object" || raw === null) {
    return badRequest("Body must be a JSON object.", origin);
  }

  const body = raw as Record<string, unknown>;

  const promptRaw = body.prompt;
  if (!isNonEmptyString(promptRaw, 3)) {
    return badRequest("Field 'prompt' must be a non-empty string (>=3 chars).", origin);
  }
  const prompt = sanitizePrompt(promptRaw);

  const guidedAnswers = validateGuidedAnswers(body.guidedAnswers);
  if (guidedAnswers === null) {
    return badRequest("Field 'guidedAnswers' must be an array of {question, choice} strings.", origin);
  }

  // Construire un prompt enrichi (si des réponses guidées sont présentes)
  let enrichedPrompt = prompt;
  if (guidedAnswers.length > 0) {
    enrichedPrompt += "\n\nDétails précisés:\n";
    for (const a of guidedAnswers) {
      enrichedPrompt += `- ${a.question} → ${a.choice}\n`;
    }
  }

  try {
    // Appel modèle (Lovable Gateway)
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
          {
            role: "user",
            content: `Generate a chess rule JSON for: "${enrichedPrompt}"\n\nRemember: Respond ONLY with valid JSON, no other text.`,
          },
        ],
        response_format: { type: "json_object" }, // force le JSON
        temperature: 0.3,
        max_tokens: 2000,
        stream: false,
      }),
    });

    // Gestion 402/429/… explicite
    if (!response.ok) {
      if (response.status === 429) {
        return json({ error: "rate_limited", message: "Rate limits exceeded, please try again later." }, 429, origin);
      }
      if (response.status === 402) {
        return json(
          { error: "payment_required", message: "Payment required, please add funds to your Lovable AI workspace." },
          402,
          origin,
        );
      }
      const errText = await response.text().catch(() => "");
      console.error("[generate-chess-rule] Lovable error:", response.status, errText.slice(0, 500));
      return json({ error: "AI_gateway_error" }, 502, origin);
    }

    // Réponse modèle
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content ?? "";

    if (typeof content !== "string" || content.trim().length === 0) {
      console.error("[generate-chess-rule] Empty model content:", result);
      return json({ ok: false, error: "empty_model_response" }, 502, origin);
    }

    // Si malgré response_format le modèle répond hors JSON, on tente d'extraire
    const extracted = extractJsonFromContent(content);
    if (!extracted) {
      // Cas ambigu: modèle pose des questions au lieu de générer
      const lc = content.toLowerCase();
      const looksLikeClarification =
        (content.includes("?") && content.length < 240) ||
        lc.includes("quel type") ||
        lc.includes("what kind") ||
        lc.includes("could you") ||
        lc.includes("pouvez-vous");

      if (looksLikeClarification) {
        return json(
          {
            ok: false,
            status: "need_info",
            error: "model_requests_clarification",
            message: content.slice(0, 400),
          },
          422,
          origin,
        );
      }

      console.error("[generate-chess-rule] JSON not found in model content:", content.slice(0, 500));
      return json({ ok: false, error: "json_not_found_in_response" }, 502, origin);
    }

    // Parse JSON proprement
    let rule: unknown;
    try {
      rule = JSON.parse(extracted);
    } catch (e) {
      console.error("[generate-chess-rule] JSON parse failed. candidate:", extracted.slice(0, 500));
      return json(
        {
          ok: false,
          error: "unable_to_parse_model_response",
          details: e instanceof Error ? e.message : String(e),
          rawResponse: content.slice(0, 500),
        },
        502,
        origin,
      );
    }

    // Garde minimale: présence de meta
    if (!rule || typeof rule !== "object" || Array.isArray(rule) || !("meta" in rule)) {
      return json({ ok: false, error: "missing_rule_meta" }, 422, origin);
    }

    // Réponse normalisée (compatible client existant)
    const payload = {
      ok: true,
      result: {
        status: "ready",
        rule: rule as Record<string, unknown>,
        choices: [{ message: { content } }],
        validation: null,
        dryRun: null,
        prompt,
        promptHash: null,
        correlationId: null,
        provider: MODEL,
        rawModelResponse: {
          model: MODEL,
          content,
          response: result,
        },
      },
    };

    return json(payload, 200, origin);
  } catch (error) {
    console.error("[generate-chess-rule] runtime error:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500, origin);
  }
});

/* =========================
   Extraction JSON tolérante
   ========================= */
function extractJsonFromContent(content: string): string | null {
  const trimmed = content.trim();

  // Si le modèle a mis un fence (malgré response_format), on extrait
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return sanitizeJsonString(fenced[1]);
  }

  // Sinon on tente les accolades
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;

  const candidate = trimmed.slice(first, last + 1);
  return sanitizeJsonString(candidate);
}

function sanitizeJsonString(s: string): string {
  return s
    .replace(/^\ufeff/, "")
    .replace(/```/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}
