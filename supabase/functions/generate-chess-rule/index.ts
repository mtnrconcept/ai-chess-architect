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

const EngineRuleSchema = z.object({
  ruleId: z.string().min(3),
  ruleName: z.string().min(1),
  description: z.string().min(5),
  // Contrat minimum attendu par ton moteur (adapte si besoin)
  visuals: z
    .object({
      icon: z.string().optional(),
      color: z.string().optional(),
      animations: z.array(z.string()).optional(),
    })
    .optional(),
  effects: z
    .array(
      z.object({
        type: z.string().min(1),
        triggers: z.array(z.string()).optional(),
        payload: z.record(z.any()).optional(),
      }),
    )
    .min(1),
  engineAdapters: z
    .object({
      // clés pour brancher le moteur : hooks & handlers
      onSelect: z.string().optional(),
      onSpecialAction: z.string().optional(),
      onTick: z.string().optional(),
      validate: z.string().optional(),
      resolveConflicts: z.string().optional(),
    })
    .partial()
    .optional(),
});

type EngineRule = z.infer<typeof EngineRuleSchema>;

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

    // Construit un prompt canonique pour forcer un JSON conforme
    const instruction = `
Tu es un compilateur de règles de jeu d'échecs variantes.
Génère UNIQUEMENT un objet JSON valide conforme au format ci-dessous, SANS COMMENTAIRES.

**STRUCTURE REQUISE** :
Pour créer une règle avec action UI (bouton), tu dois générer PLUSIEURS effets :
1. UN effet qui définit le bouton UI (avec trigger "ui.XXX" et les infos du bouton)
2. UN ou PLUSIEURS effets qui définissent ce qui se passe (avec des actions concrètes)

**Actions disponibles** (pour le champ "type" dans les effets de logique) :
- vfx.play : joue une animation visuelle
- audio.play : joue un son
- ui.toast : affiche un message
- piece.spawn : crée une pièce
- piece.capture : capture une pièce
- piece.move : déplace une pièce
- piece.duplicate : duplique une pièce
- piece.setInvisible : rend invisible
- status.add : ajoute un statut temporisé (frozen, etc.)
- status.remove : retire un statut
- tile.setTrap : place un piège sur une case
- tile.clearTrap : retire un piège
- tile.resolveTrap : déclenche un piège
- cooldown.set : met un cooldown
- turn.end : termine le tour
- state.set, state.inc, state.delete : gestion de compteurs

**Conditions disponibles** :
- cooldown.ready, piece.isTypeInScope
- ctx.hasTargetTile, ctx.hasTargetPiece
- tile.isEmpty, piece.exists, tile.withinBoard
- target.isEnemy, target.isFriendly
- piece.hasStatus, target.hasStatus
- state.exists, state.equals, state.lessThan
- random.chance

**Providers pour ciblage** :
- provider.anyEmptyTile : toutes cases vides
- provider.neighborsEmpty : cases voisines vides
- provider.enemyPieces : pièces ennemies
- provider.friendlyPieces : pièces alliées
- provider.piecesInRadius : pièces dans un rayon
- provider.enemiesInLineOfSight : ennemis en ligne de vue

**EXEMPLE DE FORMAT CORRECT** :
{
  "ruleId": "rule_catapult_${Date.now()}",
  "ruleName": "Poser une catapulte",
  "description": "Les pions peuvent poser une catapulte sur une case adjacente vide",
  "effects": [
    {
      "type": "ui_action_definition",
      "triggers": ["ui.place_catapult"],
      "payload": {
        "label": "Poser catapulte",
        "hint": "Place une catapulte sur une case voisine",
        "icon": "🎯",
        "pieceTypes": ["pawn"],
        "targetingMode": "tile",
        "provider": "provider.neighborsEmpty",
        "consumesTurn": true,
        "cooldown": 3,
        "conditions": ["cooldown.ready", "ctx.hasTargetTile", "tile.isEmpty"]
      }
    },
    {
      "type": "tile.setTrap",
      "triggers": ["ui.place_catapult"],
      "payload": {
        "tile": "$targetTile",
        "kind": "catapult",
        "sprite": "catapult_icon"
      }
    },
    {
      "type": "audio.play",
      "triggers": ["ui.place_catapult"],
      "payload": {
        "id": "place"
      }
    },
    {
      "type": "cooldown.set",
      "triggers": ["ui.place_catapult"],
      "payload": {
        "pieceId": "$pieceId",
        "actionId": "place_catapult",
        "turns": 3
      }
    },
    {
      "type": "turn.end",
      "triggers": ["ui.place_catapult"],
      "payload": {}
    }
  ],
  "visuals": {
    "icon": "🎯",
    "color": "#ff6600"
  },
  "engineAdapters": {}
}

**IMPORTANT** :
- Le PREMIER effet avec trigger "ui.XXX" définit le bouton (son type peut être "ui_action_definition")
- Les AUTRES effets avec le MÊME trigger "ui.XXX" définissent les actions concrètes
- Utilise des noms d'actions RÉELS (tile.setTrap, audio.play, etc.)
- N'oublie JAMAIS turn.end à la fin si consumesTurn est true

**Prompt utilisateur** :
${prompt}
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

    console.log('[generate-chess-rule] Raw JSON from AI:', sanitized.slice(0, 500));

    const checked = EngineRuleSchema.safeParse(candidate);
    if (!checked.success) {
      console.error('[generate-chess-rule] Validation failed:', checked.error.flatten());
      return withCors(
        json(
          {
            ok: false,
            error: "InvalidModelJSON",
            details: checked.error.flatten(),
            raw: sanitized.slice(0, 2000),
          },
          422,
        ),
      );
    }

    const rule: EngineRule = checked.data;

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
