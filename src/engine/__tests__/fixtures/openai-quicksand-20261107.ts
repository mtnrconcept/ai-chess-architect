import type { RuleJSON } from "../../types";

/**
 * Captured from the real GPT-5.6 Sol structured generation on 2026-11-07.
 * Response id: resp_07bdff5aa4930ff9016aef1fcdf9a887d282722679befac051
 * Independent coverage audit id: resp_0a94e9c133f6a74d016aef1fe6e0b887d2a24bbd706b15884e
 * Coverage: 100%.
 *
 * AI compile returns a draft (isActive=false); runtime tests activate a clone
 * exactly as publication would, without changing any gameplay instructions.
 */
export const realOpenAIQuicksandRule: RuleJSON = {
  "ui": {
    "actions": [
      {
        "id": "pawn-quicksand-traps.place-quicksand",
        "hint": "Pose un piège visible sur une case vide adjacente au pion. Chaque pion peut utiliser cette action trois fois au maximum, sans recharge, et la pose termine le tour.",
        "label": "Poser des sables mouvants",
        "cooldown": {
          "perPiece": 0
        },
        "targeting": {
          "mode": "tile",
          "validTilesProvider": "provider.neighborsEmpty"
        },
        "maxPerPiece": 3,
        "availability": {
          "cooldownOk": false,
          "pieceTypes": [
            "pawn"
          ],
          "requiresSelection": true
        },
        "consumesTurn": true
      }
    ]
  },
  "meta": {
    "tags": [
      "quicksand",
      "trap",
      "pawn",
      "visible",
      "capture"
    ],
    "ruleId": "pawn-quicksand-traps@draft",
    "version": "2.0.0",
    "category": "capture",
    "isActive": false,
    "priority": 100,
    "ruleName": "Pièges de sables mouvants des pions",
    "description": "Chaque pion peut poser jusqu’à trois pièges visibles de sables mouvants sur une case vide adjacente. Le premier ennemi qui pénètre dans un piège est capturé, tandis que les alliés le traversent sans effet."
  },
  "logic": {
    "effects": [
      {
        "do": [
          {
            "action": "tile.setTrap",
            "params": {
              "kind": "quicksand",
              "tile": "$targetTile",
              "owner": "$ctx.side",
              "sprite": "quicksand"
            }
          },
          {
            "action": "vfx.play",
            "params": {
              "tile": "$targetTile",
              "sprite": "quicksand"
            }
          }
        ],
        "id": "pawn-quicksand-traps.place-quicksand-trap",
        "if": [
          "and",
          "ctx.hasTargetTile",
          "tile.isEmpty",
          "tile.withinBoard",
          "piece.isTypeInScope"
        ],
        "when": "ui.pawn-quicksand-traps.place-quicksand",
        "onFail": "blockAction",
        "message": "Choisissez une case vide adjacente au pion.",
        "priority": 100
      },
      {
        "do": [
          {
            "action": "tile.resolveTrap",
            "params": {
              "tile": "$ctx.to",
              "persistent": false
            }
          }
        ],
        "id": "pawn-quicksand-traps.resolve-entered-quicksand",
        "if": "always",
        "when": "lifecycle.onEnterTile",
        "onFail": "skip",
        "message": "La case ne contient aucun piège ennemi à résoudre.",
        "priority": 100
      }
    ]
  },
  "scope": {
    "sides": [
      "white",
      "black"
    ],
    "affectedPieces": [
      "any"
    ]
  },
  "state": {
    "schema": {},
    "initial": {},
    "namespace": "rules.pawn_quicksand_traps",
    "serialize": true
  },
  "createdAt": "1970-01-01T00:00:00.000Z",
  "integration": {
    "ruleArchitect": {
      "source": "ai-blueprint",
      "engineVersion": "2.0.0",
      "schemaVersion": "2.0.0",
      "blueprintRuleKey": "pawn-quicksand-traps"
    }
  }
};
