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
Génère UNIQUEMENT un objet JSON valide conforme au format ci-dessous.

**IMPORTANT : Actions et triggers disponibles**

Actions d'effets disponibles :
- vfx.play, audio.play, ui.toast
- piece.spawn, piece.capture, piece.move, piece.duplicate
- piece.setInvisible
- status.add, status.remove (avec duration pour statuts temporisés)
- tile.setTrap, tile.clearTrap, tile.resolveTrap
- cooldown.set, turn.end
- state.set, state.inc, state.delete

Triggers (événements) disponibles :
- ui.CUSTOM_ACTION_ID (pour actions spéciales)
- lifecycle.onMoveCommitted
- lifecycle.onEnterTile
- lifecycle.onTurnStart
- lifecycle.onPromote
- status.expired

Conditions disponibles (pour payload.conditions) :
- cooldown.ready, piece.isTypeInScope
- ctx.hasTargetTile, ctx.hasTargetPiece
- tile.isEmpty, piece.exists, tile.withinBoard
- target.isEnemy, target.isFriendly
- piece.hasStatus, target.hasStatus
- state.exists, state.equals, state.lessThan
- random.chance

Providers (pour payload.provider) :
- provider.anyEmptyTile
- provider.neighborsEmpty
- provider.enemyPieces
- provider.friendlyPieces
- provider.piecesInRadius
- provider.enemiesInLineOfSight

Opérateurs logiques (dans conditions) :
- ["not", condition]
- ["and", cond1, cond2]
- ["or", cond1, cond2]

**Format JSON attendu** (RESPECTE CES NOMS EXACTS) :
{
  "ruleId": "rule_${Date.now()}",
  "ruleName": "Nom court de la règle",
  "description": "Description détaillée de l'effet de la règle",
  "effects": [
    {
      "type": "NOM_ACTION_CI_DESSUS",
      "triggers": ["NOM_TRIGGER_CI_DESSUS"],
      "payload": { 
        "pieceId": "$pieceId",
        "targetTile": "$targetTile",
        "targetPieceId": "$targetPieceId",
        "statusKey": "frozen",
        "duration": 2,
        "conditions": ["cooldown.ready", "ctx.hasTargetPiece"],
        "provider": "provider.enemiesInLineOfSight",
        "targetingMode": "piece",
        "label": "Nom de l'action",
        "hint": "Description",
        "consumesTurn": true,
        "cooldown": 2
      }
    }
  ],
  "visuals": { "icon": "❄️", "color": "#00f" },
  "engineAdapters": {}
}

**Variables disponibles dans payload** :
- $pieceId : ID de la pièce qui effectue l'action
- $targetTile : Case cible
- $targetPieceId : ID de la pièce cible (si présente)
- $params.* : Paramètres de la règle

**Champs obligatoires** :
- ruleId (string, unique)
- ruleName (string, nom court)
- description (string, détails de la règle)
- effects (array, minimum 1 effet avec "type" obligatoire)

**Prompt utilisateur (locale=${locale})** :
${prompt}

**Contexte supplémentaire** :
${JSON.stringify(context ?? {}, null, 2)}
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
