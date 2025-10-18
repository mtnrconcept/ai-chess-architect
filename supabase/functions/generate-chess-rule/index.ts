// /supabase/functions/generate-chess-rule/index.ts
// Deno Deploy (Supabase Edge Functions)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors, preflightIfOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";

// —— Config runtime ——
const MODEL_TIMEOUT_MS = 45000; // < 60s pour rester sous limite CF/Supabase
const BODY_LIMIT_BYTES = 256 * 1024; // 256 KB, protège contre payloads énormes

// —— Schémas d'entrées/sorties ——
const RulePromptSchema = z.object({
  prompt: z.string().min(3).max(2000),
  locale: z.enum(["fr", "en"]).optional().default("fr"),
  temperature: z.number().min(0).max(2).optional().default(0.4),
  // context facultatif (état du jeu, presets, etc.)
  context: z.record(z.any()).optional(),
});

// RuleJSON schema - format attendu par le moteur
const RuleJSONSchema = z.object({
  meta: z.object({
    ruleId: z.string().min(3),
    ruleName: z.string().min(1),
    description: z.string().min(5),
    category: z.enum(["special", "movement", "capture", "defense", "ai-generated"]).optional(),
    version: z.string().optional(),
    isActive: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  }),
  scope: z.object({
    affectedPieces: z.array(z.string()).optional(),
    sides: z.array(z.enum(["white", "black"])).optional(),
  }).optional(),
  ui: z.object({
    actions: z.array(z.object({
      id: z.string(),
      label: z.string(),
      hint: z.string().optional(),
      icon: z.string().optional(),
      availability: z.object({
        requiresSelection: z.boolean().optional(),
        pieceTypes: z.array(z.string()).optional(),
        phase: z.string().optional(),
        cooldownOk: z.boolean().optional(),
      }).optional(),
      targeting: z.object({
        mode: z.enum(["tile", "piece", "none"]).optional(),
        validTilesProvider: z.string().optional(),
      }).optional(),
      consumesTurn: z.boolean().optional(),
      cooldown: z.object({
        perPiece: z.number().optional(),
        global: z.number().optional(),
      }).optional(),
    })),
  }).optional(),
  logic: z.object({
    effects: z.array(z.object({
      id: z.string(),
      when: z.string(),
      if: z.union([z.string(), z.array(z.string())]).optional(),
      do: z.array(z.object({
        action: z.string(),
        params: z.record(z.any()).optional(),
      })),
      onFail: z.string().optional(),
    })),
  }),
  state: z.object({
    namespace: z.string(),
    initial: z.record(z.any()).optional(),
  }).optional(),
  parameters: z.record(z.any()).optional(),
  assets: z.record(z.any()).optional(),
});

type RuleJSON = z.infer<typeof RuleJSONSchema>;

// —— Accès modèle via Lovable AI Gateway ——
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = Deno.env.get("MODEL") ?? "google/gemini-2.5-flash";

// Log startup config (sans exposer la clé)
console.log(`[generate-chess-rule] Starting with model=${MODEL}, key=${LOVABLE_API_KEY ? "present" : "MISSING"}`);

// Utilitaire: appel modèle qui renvoie TOUJOURS une string JSON (ou lance une erreur contrôlée)
async function callModelJSON(
  prompt: string,
  temperature: number,
  signal: AbortSignal,
): Promise<string> {
  if (!LOVABLE_API_KEY) {
    console.error("[generate-chess-rule] LOVABLE_API_KEY is missing in environment");
    throw new Error("Missing LOVABLE_API_KEY");
  }
  
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "Tu es un compilateur de règles de jeu d'échecs variantes. Réponds STRICTEMENT en JSON unique conforme au schéma demandé, sans texte avant/après, sans markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[generate-chess-rule] Lovable AI error ${res.status}:`, text.slice(0, 500));
    throw new Error(`LovableAIError ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    console.error("[generate-chess-rule] Empty model response:", data);
    throw new Error("EmptyModelResponse");
  }
  return raw;
}

// —— Utilitaires sécurité / robustesse ——
async function readBodyWithLimit(
  req: Request,
  limitBytes: number,
): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value?.length ?? 0;
    if (received > limitBytes) {
      throw new Error("PayloadTooLarge");
    }
    chunks.push(value);
  }
  return chunks.length ? concatenate(chunks) : new Uint8Array();
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// —— Serve ——
serve(async (rawReq) => {
  // Preflight CORS
  const preflight = preflightIfOptions(rawReq);
  if (preflight) return preflight;

  try {
    // Sécurise taille payload
    const bodyBytes = await readBodyWithLimit(rawReq, BODY_LIMIT_BYTES);
    const bodyText = new TextDecoder().decode(bodyBytes) || "{}";

    // Validation input
    const parsedInput = RulePromptSchema.safeParse(JSON.parse(bodyText));
    if (!parsedInput.success) {
      return withCors(
        json(
          {
            ok: false,
            error: "InvalidInput",
            details: parsedInput.error.flatten(),
          },
          400,
        ),
      );
    }
    const { prompt, temperature, locale, context } = parsedInput.data;

    // Timeout contrôlé
    const aborter = new AbortController();
    const timer = setTimeout(
      () => aborter.abort("ModelTimeout"),
      MODEL_TIMEOUT_MS,
    );

    // Construit un prompt pour générer du RuleJSON directement
    const instruction = `
Tu es un compilateur de règles de jeu d'échecs variantes.
Génère UNIQUEMENT un objet JSON valide conforme au format RuleJSON ci-dessous.

**FORMAT OBLIGATOIRE RuleJSON** :
{
  "meta": {
    "ruleId": "rule_unique_${Date.now()}",
    "ruleName": "Nom court en français",
    "description": "Description détaillée",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["tag1", "tag2"]
  },
  "scope": {
    "affectedPieces": ["pawn", "rook"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [
      {
        "id": "action_unique_id",
        "label": "Libellé du bouton",
        "hint": "Description de l'action",
        "icon": "🎯",
        "availability": {
          "requiresSelection": true,
          "pieceTypes": ["pawn"],
          "phase": "main",
          "cooldownOk": true
        },
        "targeting": {
          "mode": "tile",
          "validTilesProvider": "provider.neighborsEmpty"
        },
        "consumesTurn": true,
        "cooldown": { "perPiece": 3 }
      }
    ]
  },
  "logic": {
    "effects": [
      {
        "id": "effect_unique",
        "when": "ui.action_unique_id",
        "if": ["cooldown.ready", "ctx.hasTargetTile", "tile.isEmpty"],
        "do": [
          { "action": "tile.setTrap", "params": {"tile": "$targetTile", "kind": "catapult"} },
          { "action": "vfx.play", "params": {"sprite": "place_trap"} },
          { "action": "audio.play", "params": {"id": "place"} },
          { "action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "action_unique_id", "turns": 3} },
          { "action": "turn.end", "params": {} }
        ],
        "onFail": "blockAction"
      }
    ]
  },
  "state": {
    "namespace": "rules.unique_id",
    "initial": {}
  },
  "parameters": {},
  "assets": {
    "icon": "🎯",
    "color": "#ff6600"
  }
}

**ACTIONS DISPONIBLES** (pour "do") :
tile.setTrap, tile.resolveTrap, tile.clearTrap, piece.spawn, piece.capture, 
piece.move, piece.duplicate, status.add, status.remove, vfx.play, audio.play, 
ui.toast, cooldown.set, turn.end, state.set, state.inc

**CONDITIONS DISPONIBLES** (pour "if") :
cooldown.ready, ctx.hasTargetTile, ctx.hasTargetPiece, tile.isEmpty, 
piece.exists, tile.withinBoard, target.isEnemy, target.isFriendly, 
piece.hasStatus, state.exists, state.equals, random.chance

**PROVIDERS** (pour validTilesProvider) :
provider.anyEmptyTile, provider.neighborsEmpty, provider.enemyPieces, 
provider.friendlyPieces, provider.piecesInRadius, provider.enemiesInLineOfSight

**EXEMPLE COMPLET - Catapultes** :
{
  "meta": {
    "ruleId": "rule_catapult_${Date.now()}",
    "ruleName": "Poser une catapulte",
    "description": "Les pions peuvent poser une catapulte sur une case adjacente vide qui permet de projeter des pièces alliées",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["trap", "movement", "pawn"]
  },
  "scope": {
    "affectedPieces": ["pawn"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [
      {
        "id": "place_catapult",
        "label": "Poser catapulte",
        "hint": "Place une catapulte sur une case voisine vide",
        "icon": "🎯",
        "availability": {
          "requiresSelection": true,
          "pieceTypes": ["pawn"],
          "phase": "main",
          "cooldownOk": true
        },
        "targeting": {
          "mode": "tile",
          "validTilesProvider": "provider.neighborsEmpty"
        },
        "consumesTurn": true,
        "cooldown": { "perPiece": 3 }
      }
    ]
  },
  "logic": {
    "effects": [
      {
        "id": "effect_place_catapult",
        "when": "ui.place_catapult",
        "if": ["cooldown.ready", "ctx.hasTargetTile", "tile.isEmpty"],
        "do": [
          { "action": "tile.setTrap", "params": {"tile": "$targetTile", "kind": "catapult", "sprite": "catapult_icon"} },
          { "action": "vfx.play", "params": {"sprite": "place_trap"} },
          { "action": "audio.play", "params": {"id": "place"} },
          { "action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "place_catapult", "turns": 3} },
          { "action": "ui.toast", "params": {"message": "Catapulte posée !", "variant": "success"} },
          { "action": "turn.end", "params": {} }
        ],
        "onFail": "blockAction"
      }
    ]
  },
  "state": {
    "namespace": "rules.catapult",
    "initial": {}
  },
  "parameters": {},
  "assets": {
    "icon": "🎯",
    "color": "#ff6600"
  }
}

**Prompt utilisateur** :
${prompt}

Génère UNIQUEMENT le JSON, sans texte avant/après ni markdown.
`.trim();

    let rawJSON = "";
    try {
      rawJSON = await callModelJSON(instruction, temperature, aborter.signal);
    } finally {
      clearTimeout(timer);
    }

    // Parfois les modèles renvoient des « fences » ```json … ```
    const sanitized = rawJSON
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // Parse + validate
    let candidate: unknown;
    try {
      candidate = JSON.parse(sanitized);
    } catch (e) {
      // Dernier filet: tente d'extraire le premier objet JSON équilibré
      const match = sanitized.match(/\{[\s\S]*\}$/);
      if (!match) {
        throw new Error("ModelReturnedNonJSON");
      }
      candidate = JSON.parse(match[0]);
    }

    console.log('[generate-chess-rule] Raw JSON from AI (preview):', sanitized.slice(0, 300));

    const checked = RuleJSONSchema.safeParse(candidate);
    if (!checked.success) {
      console.error('[generate-chess-rule] Validation failed:', checked.error.flatten());
      return withCors(
        json(
          {
            ok: false,
            error: "InvalidRuleJSON",
            details: checked.error.flatten(),
            raw: sanitized.slice(0, 2000),
          },
          422,
        ),
      );
    }

    const rule: RuleJSON = checked.data;
    
    console.log('[generate-chess-rule] Rule validated:', {
      ruleId: rule.meta.ruleId,
      effectsCount: rule.logic.effects.length,
      hasUI: !!rule.ui
    });

    // Succès
    return withCors(json({ ok: true, rule }, 200));
  } catch (err: unknown) {
    // Journalisation contrôlée (évite 502)
    const errMessage = err instanceof Error ? err.message : String(err);
    const code =
      errMessage === "ModelTimeout"
        ? 504
        : errMessage === "PayloadTooLarge"
          ? 413
          : 500;

    const safe = {
      ok: false,
      error: "GenerateRuleFailed",
      reason: errMessage,
    };

    // Toujours répondre JSON (jamais laisser planter)
    return withCors(json(safe, code));
  }
});
