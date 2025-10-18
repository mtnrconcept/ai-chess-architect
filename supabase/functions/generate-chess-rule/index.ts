// /supabase/functions/generate-chess-rule/index.ts
// Deno Deploy (Supabase Edge Functions)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors, preflightIfOptions } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { generateRuleId, promptHash, generateCorrelationId } from "../_shared/identity.ts";
import { validateRuleJSON } from "../_shared/validation.ts";
import { dryRunRule } from "../_shared/dryRunner.ts";
import { trackEvent } from "../_shared/telemetry.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// —— Config runtime ——
const MODEL_TIMEOUT_MS = 45000; // < 60s pour rester sous limite CF/Supabase
const BODY_LIMIT_BYTES = 256 * 1024; // 256 KB, protège contre payloads énormes
const STRICT_DRYRUN = Deno.env.get("STRICT_DRYRUN") !== "false"; // Par défaut strict

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
    effects: z.array(z.any()), // Temporairement permissif pour diagnostic
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

  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  try {
    // Extraire le userId du JWT (optionnel)
    let userId: string | null = null;
    const authHeader = rawReq.headers.get("authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const payload = JSON.parse(atob(token.split(".")[1]));
        userId = payload.sub || null;
      } catch (err) {
        console.warn("[generate-chess-rule] Failed to extract userId from JWT:", err);
      }
    }

    // Sécurise taille payload
    const bodyBytes = await readBodyWithLimit(rawReq, BODY_LIMIT_BYTES);
    const bodyText = new TextDecoder().decode(bodyBytes) || "{}";

    // Validation input
    const parsedInput = RulePromptSchema.safeParse(JSON.parse(bodyText));
    if (!parsedInput.success) {
      trackEvent("rulegen.invalid_input", { correlationId, errors: parsedInput.error.flatten() });
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
    
    // Calcul du hash prompt (pour déduplication)
    const promptKey = await promptHash(prompt);

    trackEvent("rulegen.prompt_received", {
      correlationId,
      promptKey,
      promptLength: prompt.length,
      locale,
      temperature,
    });

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

🚨 RÈGLE CRITIQUE ABSOLUE 🚨
TOUS les IDs d'actions UI dans "ui.actions[].id" DOIVENT OBLIGATOIREMENT commencer par le préfixe "special_"
Exemples valides : "special_place_mine", "special_freeze_ray", "special_jump", "special_explode"
Le "when" dans logic.effects doit référencer "ui.special_xxx" (avec le préfixe) pour correspondre à l'action UI.

**FORMAT OBLIGATOIRE RuleJSON** :
{
  "meta": {
    "ruleId": "rule_unique_id",         // ID unique pour la règle
    "ruleName": "Nom court",            // Nom affiché dans l'interface
    "description": "Description",       // Explication détaillée de la règle
    "category": "special",              // "special" | "movement" | "capture" | "defense"
    "version": "1.0.0",                 // Versioning sémantique
    "isActive": true,                   // Active par défaut
    "tags": ["tag1", "tag2"]            // Tags pour filtrage/recherche
  },
  "scope": {
    "affectedPieces": ["pawn"],         // Pièces concernées (pawn, rook, knight, bishop, queen, king)
    "sides": ["white", "black"]         // Camps concernés
  },
  "ui": {
    "actions": [                        // Actions disponibles dans l'interface
      {
        "id": "special_action_id",      // ⚠️ OBLIGATOIRE : ID doit commencer par "special_"
        "label": "Label bouton",        // Texte du bouton
        "hint": "Tooltip",              // Description au survol
        "icon": "🎯",                   // Emoji ou icône
        "availability": {
          "requiresSelection": true,    // Nécessite une pièce sélectionnée
          "pieceTypes": ["pawn"],       // Types de pièces autorisées
          "phase": "main",              // Phase de jeu (main, pre-move)
          "cooldownOk": true            // Vérifie le cooldown avant affichage
        },
        "targeting": {
          "mode": "tile",               // "tile" | "piece" | "none"
          "validTilesProvider": "provider.neighborsEmpty"  // Provider pour cases valides
        },
        "consumesTurn": true,           // Termine le tour après exécution
        "cooldown": {
          "perPiece": 3,                // Cooldown par pièce (tours)
          "global": 0                   // Cooldown global (optionnel)
        }
      }
    ]
  },
  "logic": {
    "effects": [                        // Effets déclenchés par des événements
      {
        "id": "effect_id",              // ID unique de l'effet
        "when": "ui.special_action_id", // ⚠️ IMPORTANT : Correspond à l'ID de l'action UI (avec "special_")
        "if": [                         // Conditions (tableau ou string unique)
          "cooldown.ready",
          "ctx.hasTargetTile",
          ["and", "cond1", "cond2"]     // Conditions composées possibles
        ],
        "do": [                         // Actions à exécuter
          {
            "action": "tile.setTrap",
            "params": {
              "tile": "$targetTile",    // Variables d'interpolation avec $
              "kind": "mine"
            }
          }
        ],
        "else": [                       // Actions si conditions échouent (préféré à onFail)
          {
            "action": "ui.toast",
            "params": {
              "message": "Action impossible",
              "variant": "warning"
            }
          },
          {
            "action": "intent.cancel"   // Annule l'action
          }
        ]
      }
    ]
  },
  "state": {
    "namespace": "rules.my_rule",       // Namespace pour isoler l'état
    "initial": {}                       // État initial (optionnel)
  },
  "parameters": {                       // Paramètres configurables
    "cooldownTurns": 3,
    "friendlyFire": false,
    "toastOnSuccess": "Action réussie !"
  },
  "assets": {                           // Assets visuels/audio
    "icon": "🎯",
    "color": "#ff6600",
    "sprites": {
      "trap": "mine_icon",
      "placeVfx": "place_trap"
    },
    "sfx": {
      "place": "place_mine"
    }
  }
}

⚠️ RÈGLE CRITIQUE : Tous les IDs d'actions UI ("ui.actions[].id") DOIVENT obligatoirement commencer par "special_"
Exemples d'IDs valides : "special_place_mine", "special_freeze_ray", "special_jump", "special_explode"
Le "when" dans logic.effects doit référencer "ui.special_xxx" pour correspondre à l'action UI.

**ACTIONS DISPONIBLES** (pour "do") :
• Tuiles : tile.setTrap, tile.clearTrap, tile.hasTrap, tile.trapMetadata, tile.isEmpty
• Pièces : piece.move, piece.spawn, piece.capture, piece.remove, piece.hasStatus, piece.isType, piece.transform, piece.damage
• Plateau : board.capture, board.move, board.areaCapture
• Statuts : status.add, status.remove, status.tickAll
• État : state.set, state.inc, state.delete, state.exists, state.equals, state.greaterThan
• VFX/Audio : vfx.play, audio.play
• UI : ui.toast, ui.showOverlay
• Cooldowns : cooldown.set, cooldown.ready
• Tours : turn.end, turn.skip
• Intent : intent.cancel, intent.confirm
• Cibles : target.isEnemy, target.isEnemyOf, target.isFriendly
• Aléatoire : random.chance, random.roll

**CONDITIONS DISPONIBLES** (pour "if") :
cooldown.ready, ctx.hasTargetTile, ctx.hasTargetPiece, tile.isEmpty, tile.hasTrap, 
tile.trapMetadata, piece.exists, piece.hasStatus, piece.isType, target.isEnemy, 
target.isEnemyOf, target.isFriendly, state.exists, state.equals, state.greaterThan, 
random.chance, random.roll, board.inBounds

**OPÉRATEURS LOGIQUES** (pour conditions composées) :
["not", condition]                     → Négation
["and", cond1, cond2, ...]            → ET logique
["or", cond1, cond2, ...]             → OU logique

Exemples :
["not", "tile.isEmpty"]
["and", "cooldown.ready", "ctx.hasTargetTile"]
["or", ["target.isEnemyOf", "$piece.side"], "$params.friendlyFire"]

**PROVIDERS** (pour "validTilesProvider") :
provider.anyEmptyTile           → Toutes les cases vides
provider.neighborsEmpty         → Cases adjacentes vides (8 directions)
provider.enemyPieces            → Toutes les pièces ennemies
provider.friendlyPieces         → Toutes les pièces alliées
provider.piecesInRadius         → Pièces dans un rayon donné
provider.enemiesInLineOfSight   → Ennemis en ligne de vue
provider.jumpOverAny            → Cases après un saut par-dessus pièce
provider.enemyNeighbors         → Pièces ennemies adjacentes

**ÉVÉNEMENTS LIFECYCLE** (pour "when") :
ui.special_ACTION_ID            → Déclenché par action utilisateur (définie dans ui.actions avec préfixe "special_")
lifecycle.onMoveCommitted       → Après validation d'un mouvement ($from, $to, $pieceId)
lifecycle.onEnterTile           → Quand une pièce entre sur une case ($to, $enteringPieceId)
lifecycle.onTurnStart           → Au début d'un tour ($side, $pieceId pour chaque pièce)
lifecycle.onPromote             → Quand un pion est promu ($pieceId, $newType)
lifecycle.onCapture             → Après une capture ($attackerId, $victimId)
status.expired                  → Quand un statut temporisé expire ($pieceId, $statusId)

**VARIABLES D'INTERPOLATION** (accessibles dans params avec $) :
$pieceId                        → ID de la pièce sélectionnée
$piece.side                     → Camp de la pièce (white|black)
$piece.type                     → Type de la pièce (pawn, rook, knight, bishop, queen, king)
$piece.position                 → Position actuelle {row, col}
$targetTile                     → Case ciblée par l'action {row, col}
$targetPieceId                  → ID de la pièce sur la case ciblée
$from                           → Case de départ (dans lifecycle.onMoveCommitted)
$to                             → Case d'arrivée (dans lifecycle.onEnterTile, onMoveCommitted)
$enteringPieceId                → ID de la pièce entrant sur une case
$params.KEY                     → Accès aux paramètres définis dans "parameters"
$assets.KEY                     → Accès aux assets définis dans "assets"
$state.KEY                      → Accès à l'état défini dans "state.initial"

**EXEMPLES COMPLETS** :

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 1 : Piège avec déclenchement automatique (Mine complète)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_mine_complete",
    "ruleName": "Poser une mine explosive",
    "description": "Les pions peuvent poser une mine qui explose au contact ennemi.",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["trap", "pawn", "explosion"]
  },
  "scope": {
    "affectedPieces": ["pawn"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_place_mine",
      "label": "Poser mine",
      "hint": "Place une mine sur une case voisine",
      "icon": "💣",
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
      "cooldown": {"perPiece": 4}
    }]
  },
  "logic": {
    "effects": [
      {
        "id": "effect_place_mine",
        "when": "ui.special_place_mine",
        "if": ["cooldown.ready", "ctx.hasTargetTile", "tile.isEmpty"],
        "do": [
          {"action": "tile.setTrap", "params": {"tile": "$targetTile", "kind": "mine", "sprite": "mine_icon", "metadata": {"ownerSide": "$piece.side"}}},
          {"action": "vfx.play", "params": {"sprite": "place_trap", "tile": "$targetTile"}},
          {"action": "audio.play", "params": {"id": "place_mine"}},
          {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_place_mine", "turns": 4}},
          {"action": "ui.toast", "params": {"message": "Mine posée !", "variant": "success"}},
          {"action": "turn.end"}
        ],
        "else": [
          {"action": "ui.toast", "params": {"message": "Impossible de poser la mine ici", "variant": "warning"}},
          {"action": "intent.cancel"}
        ]
      },
      {
        "id": "effect_trigger_mine",
        "when": "lifecycle.onEnterTile",
        "if": [
          ["tile.hasTrap", "$to", "mine"],
          ["target.isEnemyOf", ["tile.trapMetadata", "$to", "ownerSide"]]
        ],
        "do": [
          {"action": "vfx.play", "params": {"sprite": "explosion_small", "tile": "$to"}},
          {"action": "audio.play", "params": {"id": "explode_mine"}},
          {"action": "board.capture", "params": {"pieceId": "$enteringPieceId"}},
          {"action": "tile.clearTrap", "params": {"tile": "$to"}},
          {"action": "ui.toast", "params": {"message": "💥 Mine déclenchée !", "variant": "destructive"}}
        ]
      }
    ]
  },
  "parameters": {
    "cooldownTurns": 4,
    "friendlyFire": false,
    "trapKind": "mine"
  },
  "state": {
    "namespace": "rules.mine",
    "initial": {}
  },
  "assets": {
    "icon": "💣",
    "color": "#333333",
    "sprites": {
      "trap": "mine_icon",
      "placeVfx": "place_trap",
      "explodeVfx": "explosion_small"
    },
    "sfx": {
      "place": "place_mine",
      "explode": "explode_mine"
    }
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 2 : Modification de mouvement (Pion sauteur)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_jumping_pawn",
    "ruleName": "Pions sauteurs",
    "description": "Les pions peuvent sauter par-dessus une pièce adjacente.",
    "category": "movement",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["pawn", "jump", "mobility"]
  },
  "scope": {
    "affectedPieces": ["pawn"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_pawn_jump",
      "label": "Sauter",
      "hint": "Saute par-dessus une pièce adjacente",
      "icon": "🦘",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["pawn"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "tile",
        "validTilesProvider": "provider.jumpOverAny"
      },
      "consumesTurn": true,
      "cooldown": {"perPiece": 2}
    }]
  },
  "logic": {
    "effects": [{
      "id": "effect_pawn_jump",
      "when": "ui.special_pawn_jump",
      "if": ["cooldown.ready", "ctx.hasTargetTile", "tile.isEmpty"],
      "do": [
        {"action": "piece.move", "params": {"pieceId": "$pieceId", "targetTile": "$targetTile"}},
        {"action": "vfx.play", "params": {"sprite": "jump_arc", "tile": "$targetTile"}},
        {"action": "audio.play", "params": {"id": "jump"}},
        {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_pawn_jump", "turns": 2}},
        {"action": "ui.toast", "params": {"message": "Saut effectué !", "variant": "info"}},
        {"action": "turn.end"}
      ],
      "else": [
        {"action": "ui.toast", "params": {"message": "Saut impossible", "variant": "warning"}},
        {"action": "intent.cancel"}
      ]
    }]
  },
  "parameters": {
    "cooldownTurns": 2
  },
  "state": {
    "namespace": "rules.jumping_pawn",
    "initial": {}
  },
  "assets": {
    "icon": "🦘",
    "color": "#4CAF50"
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 3 : Lifecycle automatique (Bouclier régénérant)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_shield_regen",
    "ruleName": "Bouclier régénérant",
    "description": "Les cavaliers gagnent un bouclier temporaire chaque tour.",
    "category": "defense",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["knight", "defense", "status"]
  },
  "scope": {
    "affectedPieces": ["knight"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": []
  },
  "logic": {
    "effects": [{
      "id": "effect_shield_regen",
      "when": "lifecycle.onTurnStart",
      "if": ["piece.isType", "$pieceId", "knight"],
      "do": [
        {"action": "status.add", "params": {"pieceId": "$pieceId", "statusId": "shield", "duration": 1, "icon": "🛡️"}},
        {"action": "vfx.play", "params": {"sprite": "shield_glow", "tile": "$piece.position"}},
        {"action": "audio.play", "params": {"id": "shield_up"}}
      ]
    }]
  },
  "parameters": {},
  "state": {
    "namespace": "rules.shield",
    "initial": {"enabled": true}
  },
  "assets": {
    "icon": "🛡️",
    "color": "#2196F3"
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 4 : Ciblage de pièce (Rayon gelant)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_freeze_enemy",
    "ruleName": "Rayon gelant",
    "description": "La reine peut geler une pièce ennemie pendant 2 tours.",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["queen", "freeze", "control"]
  },
  "scope": {
    "affectedPieces": ["queen"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_freeze_ray",
      "label": "Geler",
      "hint": "Gèle une pièce ennemie en ligne de vue",
      "icon": "❄️",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["queen"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "piece",
        "validTilesProvider": "provider.enemiesInLineOfSight"
      },
      "consumesTurn": false,
      "cooldown": {"perPiece": 3}
    }]
  },
  "logic": {
    "effects": [{
      "id": "effect_freeze",
      "when": "ui.special_freeze_ray",
      "if": ["cooldown.ready", "ctx.hasTargetPiece", "target.isEnemy"],
      "do": [
        {"action": "status.add", "params": {"pieceId": "$targetPieceId", "statusId": "frozen", "duration": 2, "icon": "🧊"}},
        {"action": "vfx.play", "params": {"sprite": "ice_blast", "tile": "$targetTile"}},
        {"action": "audio.play", "params": {"id": "freeze"}},
        {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_freeze_ray", "turns": 3}},
        {"action": "ui.toast", "params": {"message": "Cible gelée !", "variant": "info"}}
      ],
      "else": [
        {"action": "ui.toast", "params": {"message": "Cible invalide", "variant": "warning"}},
        {"action": "intent.cancel"}
      ]
    }]
  },
  "parameters": {
    "freezeDuration": 2
  },
  "state": {
    "namespace": "rules.freeze",
    "initial": {}
  },
  "assets": {
    "icon": "❄️",
    "color": "#00BCD4"
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 5 : Explosion de zone (Sacrifice avec AOE)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_tower_blast",
    "ruleName": "Explosion de tour",
    "description": "Les tours peuvent exploser pour détruire toutes les pièces dans un rayon de 2 cases.",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["rook", "explosion", "sacrifice"]
  },
  "scope": {
    "affectedPieces": ["rook"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_tower_explode",
      "label": "Exploser",
      "hint": "Détruit la tour et toutes les pièces alentour",
      "icon": "💥",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["rook"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "none"
      },
      "consumesTurn": true,
      "cooldown": {"perPiece": 999}
    }]
  },
  "logic": {
    "effects": [{
      "id": "effect_explode",
      "when": "ui.special_tower_explode",
      "if": [],
      "do": [
        {"action": "vfx.play", "params": {"sprite": "big_explosion", "tile": "$piece.position"}},
        {"action": "audio.play", "params": {"id": "big_boom"}},
        {"action": "board.areaCapture", "params": {"center": "$piece.position", "radius": 2, "includeSelf": true}},
        {"action": "ui.toast", "params": {"message": "💥 BOOM !", "variant": "destructive"}},
        {"action": "turn.end"}
      ]
    }]
  },
  "parameters": {
    "explosionRadius": 2
  },
  "state": {
    "namespace": "rules.tower_blast",
    "initial": {}
  },
  "assets": {
    "icon": "💥",
    "color": "#FF5722"
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 6 : Transformation temporaire (Métamorphose)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_bishop_morph",
    "ruleName": "Métamorphose du fou",
    "description": "Le fou peut se transformer en cavalier pendant 3 tours.",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["bishop", "transform", "versatile"]
  },
  "scope": {
    "affectedPieces": ["bishop"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_bishop_morph",
      "label": "Se transformer",
      "hint": "Devient un cavalier pendant 3 tours",
      "icon": "🦎",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["bishop"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "none"
      },
      "consumesTurn": false,
      "cooldown": {"perPiece": 5}
    }]
  },
  "logic": {
    "effects": [{
      "id": "effect_morph_start",
      "when": "ui.special_bishop_morph",
      "if": ["cooldown.ready"],
      "do": [
        {"action": "piece.transform", "params": {"pieceId": "$pieceId", "newType": "knight", "duration": 3}},
        {"action": "vfx.play", "params": {"sprite": "morph_effect", "tile": "$piece.position"}},
        {"action": "audio.play", "params": {"id": "transform"}},
        {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_bishop_morph", "turns": 5}},
        {"action": "ui.toast", "params": {"message": "Transformation réussie !", "variant": "success"}}
      ],
      "else": [
        {"action": "ui.toast", "params": {"message": "Impossible de se transformer", "variant": "warning"}},
        {"action": "intent.cancel"}
      ]
    }]
  },
  "parameters": {
    "morphDuration": 3
  },
  "state": {
    "namespace": "rules.bishop_morph",
    "initial": {}
  },
  "assets": {
    "icon": "🦎",
    "color": "#9C27B0"
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 7 : Statut avec expiration (Poison temporisé)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_poison_attack",
    "ruleName": "Attaque empoisonnée",
    "description": "Les pions peuvent empoisonner une pièce ennemie adjacente qui perdra 1 PV/tour pendant 3 tours.",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["pawn", "poison", "damage-over-time"]
  },
  "scope": {
    "affectedPieces": ["pawn"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_apply_poison",
      "label": "Empoisonner",
      "hint": "Empoisonne une pièce ennemie adjacente",
      "icon": "☠️",
      "availability": {
        "requiresSelection": true,
        "pieceTypes": ["pawn"],
        "phase": "main",
        "cooldownOk": true
      },
      "targeting": {
        "mode": "piece",
        "validTilesProvider": "provider.enemyNeighbors"
      },
      "consumesTurn": false,
      "cooldown": {"perPiece": 4}
    }]
  },
  "logic": {
    "effects": [
      {
        "id": "effect_apply_poison",
        "when": "ui.special_apply_poison",
        "if": ["cooldown.ready", "ctx.hasTargetPiece", "target.isEnemy"],
        "do": [
          {"action": "status.add", "params": {"pieceId": "$targetPieceId", "statusId": "poisoned", "duration": 3, "icon": "🤢", "damagePerTurn": 1}},
          {"action": "vfx.play", "params": {"sprite": "poison_cloud", "tile": "$targetTile"}},
          {"action": "audio.play", "params": {"id": "poison_apply"}},
          {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_apply_poison", "turns": 4}},
          {"action": "ui.toast", "params": {"message": "Cible empoisonnée !", "variant": "success"}}
        ],
        "else": [
          {"action": "ui.toast", "params": {"message": "Cible invalide", "variant": "warning"}},
          {"action": "intent.cancel"}
        ]
      },
      {
        "id": "effect_poison_tick",
        "when": "lifecycle.onTurnStart",
        "if": ["piece.hasStatus", "$pieceId", "poisoned"],
        "do": [
          {"action": "piece.damage", "params": {"pieceId": "$pieceId", "amount": 1}},
          {"action": "vfx.play", "params": {"sprite": "poison_damage", "tile": "$piece.position"}},
          {"action": "audio.play", "params": {"id": "poison_tick"}},
          {"action": "status.tickAll", "params": {}}
        ]
      }
    ]
  },
  "parameters": {
    "poisonDuration": 3,
    "damagePerTurn": 1
  },
  "state": {
    "namespace": "rules.poison",
    "initial": {}
  },
  "assets": {
    "icon": "☠️",
    "color": "#8BC34A"
  }
}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLE 8 : Condition composite complexe (Mine intelligente)
═══════════════════════════════════════════════════════════════════════════════
{
  "meta": {
    "ruleId": "rule_smart_mine",
    "ruleName": "Mine intelligente",
    "description": "Mine qui explose seulement si la pièce ennemie est une pièce majeure (reine, tour) OU si friendly-fire activé.",
    "category": "special",
    "version": "1.0.0",
    "isActive": true,
    "tags": ["trap", "smart", "conditional"]
  },
  "scope": {
    "affectedPieces": ["pawn"],
    "sides": ["white", "black"]
  },
  "ui": {
    "actions": [{
      "id": "special_place_smart_mine",
      "label": "Poser mine intelligente",
      "hint": "Mine qui cible les pièces majeures",
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
      "cooldown": {"perPiece": 5}
    }]
  },
  "logic": {
    "effects": [
      {
        "id": "effect_place_smart_mine",
        "when": "ui.special_place_smart_mine",
        "if": ["cooldown.ready", "ctx.hasTargetTile", "tile.isEmpty"],
        "do": [
          {"action": "tile.setTrap", "params": {"tile": "$targetTile", "kind": "smart_mine", "sprite": "smart_mine_icon", "metadata": {"ownerSide": "$piece.side"}}},
          {"action": "vfx.play", "params": {"sprite": "place_trap", "tile": "$targetTile"}},
          {"action": "audio.play", "params": {"id": "place_mine"}},
          {"action": "cooldown.set", "params": {"pieceId": "$pieceId", "actionId": "special_place_smart_mine", "turns": 5}},
          {"action": "ui.toast", "params": {"message": "Mine intelligente posée !", "variant": "info"}},
          {"action": "turn.end"}
        ],
        "else": [
          {"action": "ui.toast", "params": {"message": "Impossible", "variant": "warning"}},
          {"action": "intent.cancel"}
        ]
      },
      {
        "id": "effect_trigger_smart_mine",
        "when": "lifecycle.onEnterTile",
        "if": [
          ["tile.hasTrap", "$to", "smart_mine"],
          ["or",
            ["and",
              ["target.isEnemyOf", ["tile.trapMetadata", "$to", "ownerSide"]],
              ["or",
                ["piece.isType", "$enteringPieceId", "queen"],
                ["piece.isType", "$enteringPieceId", "rook"]
              ]
            ],
            ["and", "$params.friendlyFire", true]
          ]
        ],
        "do": [
          {"action": "vfx.play", "params": {"sprite": "smart_explosion", "tile": "$to"}},
          {"action": "audio.play", "params": {"id": "smart_boom"}},
          {"action": "board.capture", "params": {"pieceId": "$enteringPieceId"}},
          {"action": "tile.clearTrap", "params": {"tile": "$to"}},
          {"action": "ui.toast", "params": {"message": "🎯 Mine ciblée déclenchée !", "variant": "destructive"}}
        ]
      }
    ]
  },
  "parameters": {
    "friendlyFire": false
  },
  "state": {
    "namespace": "rules.smart_mine",
    "initial": {}
  },
  "assets": {
    "icon": "🎯",
    "color": "#FF9800"
  }
}

═══════════════════════════════════════════════════════════════════════════════

**RÈGLES IMPORTANTES** :
1. Toujours inclure une branche "else" avec ui.toast + intent.cancel (jamais "onFail")
2. Toujours spécifier "tile" dans vfx.play (ex: {"sprite": "effect", "tile": "$targetTile"})
3. Toujours remplir "parameters" avec des valeurs configurables
4. Toujours utiliser des variables d'interpolation $ pour les références dynamiques
5. Pour les pièges/traps, toujours créer 2 effets : placement (ui.action) + déclenchement (lifecycle.onEnterTile)
6. Utiliser des conditions composées ["and", "or", "not"] pour logique complexe
7. Toujours inclure des feedbacks (vfx.play, audio.play, ui.toast)

**Prompt utilisateur** :
${prompt}

Génère UNIQUEMENT le JSON valide, sans texte avant/après ni markdown.
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

    // PHASE 1 DIAGNOSTIC: Logs détaillés avant validation
    console.log('[DIAGNOSTIC] Full raw JSON:', JSON.stringify(candidate, null, 2));
    console.log('[DIAGNOSTIC] Type checks:', {
      hasLogic: !!(candidate as any)?.logic,
      logicType: typeof (candidate as any)?.logic,
      hasEffects: !!(candidate as any)?.logic?.effects,
      effectsIsArray: Array.isArray((candidate as any)?.logic?.effects),
      effectsLength: (candidate as any)?.logic?.effects?.length,
      firstEffect: (candidate as any)?.logic?.effects?.[0],
      firstEffectDo: (candidate as any)?.logic?.effects?.[0]?.do,
      firstEffectDoIsArray: Array.isArray((candidate as any)?.logic?.effects?.[0]?.do),
    });

    const checked = RuleJSONSchema.safeParse(candidate);
    if (!checked.success) {
      console.error('[generate-chess-rule] Validation failed:', checked.error.flatten());
      trackEvent("rulegen.zod_validation_failed", { correlationId, errors: checked.error.flatten() });
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
    
    // Générer ID serveur et version
    const ruleId = generateRuleId();
    rule.meta.ruleId = ruleId;
    rule.meta.version = rule.meta.version || "1.0.0";
    
    trackEvent("rulegen.zod_validated", { correlationId, ruleId });
    
    console.log('[generate-chess-rule] Rule validated (Zod):', {
      ruleId: rule.meta.ruleId,
      effectsCount: rule.logic.effects.length,
      hasUI: !!rule.ui
    });

    // Validation AJV stricte
    const ajvResult = validateRuleJSON(rule);
    if (!ajvResult.valid) {
      console.error('[generate-chess-rule] AJV validation failed:', ajvResult.errors);
      console.error('[VALIDATION DEBUG] UI actions:', JSON.stringify(rule.ui?.actions, null, 2));
      console.error('[VALIDATION DEBUG] Logic effects when clauses:', JSON.stringify(rule.logic.effects.map(e => ({ id: e.id, when: e.when })), null, 2));
      console.error('[VALIDATION DEBUG] Full rule JSON:', JSON.stringify(rule, null, 2));
      trackEvent("rulegen.ajv_validation_failed", { correlationId, ruleId, errors: ajvResult.errors });
      return withCors(json({
        ok: false,
        error: "AJVValidationFailed",
        details: ajvResult.errors,
        warnings: ajvResult.warnings,
      }, 422));
    }

    if (ajvResult.warnings?.length) {
      console.warn(`[generate-chess-rule] Warnings for ${ruleId}:`, ajvResult.warnings);
    }

    trackEvent("rulegen.ajv_validated", {
      correlationId,
      ruleId,
      warnings: ajvResult.warnings?.length || 0,
    });

    // Dry-run
    const dryRunResult = await dryRunRule(rule);
    
    trackEvent("rulegen.dryrun_completed", {
      correlationId,
      ruleId,
      success: dryRunResult.success,
      executedActions: dryRunResult.executedActions.length,
      errors: dryRunResult.errors.length,
      warnings: dryRunResult.warnings.length,
    });

    // Mode strict: bloquer si dry-run échoue
    if (STRICT_DRYRUN && !dryRunResult.success) {
      console.error('[generate-chess-rule] Dry-run failed:', dryRunResult.errors);
      return withCors(json({
        ok: false,
        error: "DryRunFailed",
        details: dryRunResult.errors,
        warnings: dryRunResult.warnings,
        executedActions: dryRunResult.executedActions,
      }, 422));
    }

    // Insertion en base
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const generationDuration = Date.now() - startTime;

    const { data: insertedRule, error: dbError } = await supabase
      .from("chess_rules")
      .upsert({
        rule_id: ruleId,
        rule_name: (rule as any).meta?.ruleName || 'AI Generated Rule',
        description: (rule as any).meta?.description || prompt.trim(),
        category: (rule as any).meta?.category || 'ai-generated',
        rule_json: rule,
        source: 'ai_generated',
        prompt: prompt.trim(),
        prompt_key: promptKey,
        ai_model: MODEL,
        generation_duration_ms: generationDuration,
        tags: (rule as any).meta?.tags || [],
        status: dryRunResult.success ? "active" : "draft",
        created_by: userId,
      }, { onConflict: "prompt_key" })
      .select()
      .single();

    if (dbError) {
      console.error("[generate-chess-rule] DB insert failed:", {
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
        message: dbError.message,
        promptKey,
        ruleId,
        hasUserId: !!userId,
        timestamp: new Date().toISOString()
      });
      
      trackEvent("rulegen.db_insert_failed", {
        correlationId,
        ruleId,
        error: dbError.message,
        code: dbError.code
      });

      // Message d'erreur plus explicite selon le code
      const errorMessages: Record<string, string> = {
        "42P10": "Configuration error: missing unique constraint on prompt_key",
        "23505": "A rule with this prompt already exists",
        "23503": "Invalid user reference",
      };

      const userMessage = errorMessages[dbError.code] || "Database insertion failed";

      return withCors(json({
        ok: false,
        error: "DBInsertFailed",
        reason: userMessage,
        details: dbError.message,
        code: dbError.code
      }, 500));
    }

    trackEvent("rulegen.persist_ok", {
      correlationId,
      ruleId,
      status: insertedRule.status,
      durationMs: generationDuration,
    });

    // Succès - Retour enrichi
    return withCors(json({
      ok: true,
      rule: insertedRule,
      meta: {
        correlationId,
        ruleId,
        promptKey,
        generationDurationMs: generationDuration,
        dryRunSuccess: dryRunResult.success,
        dryRunWarnings: dryRunResult.warnings,
        ajvWarnings: ajvResult.warnings || [],
      },
    }, 200));
  } catch (err: unknown) {
    // Journalisation contrôlée (évite 502)
    const errMessage = err instanceof Error ? err.message : String(err);
    const code =
      errMessage === "ModelTimeout"
        ? 504
        : errMessage === "PayloadTooLarge"
          ? 413
          : 500;

    trackEvent("rulegen.unexpected_error", {
      correlationId,
      error: errMessage,
      stack: err instanceof Error ? err.stack : undefined,
    });

    const safe = {
      ok: false,
      error: "GenerateRuleFailed",
      reason: errMessage,
    };

    // Toujours répondre JSON (jamais laisser planter)
    return withCors(json(safe, code));
  }
});
