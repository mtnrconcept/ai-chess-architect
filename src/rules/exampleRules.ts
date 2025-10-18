import { RuleJSON } from "@/engine/types";

export const freezeMissileRule: RuleJSON = {
  meta: {
    ruleId: "r_freeze_missile",
    ruleName: "Missiles Gelants",
    isActive: true,
    category: "attack",
    description: "Les pions peuvent tirer un missile qui gèle une pièce ennemie pendant 2 tours",
    tags: ["attack", "status", "ranged"]
  },
  scope: {
    affectedPieces: ["pawn"],
    sides: ["white", "black"]
  },
  ui: {
    actions: [{
      id: "special_freeze_missile",
      label: "Missile gelant",
      hint: "Tire un missile qui gèle la pièce cible pendant 2 tours",
      icon: "❄️",
      availability: {
        requiresSelection: true,
        pieceTypes: ["pawn"],
        phase: "main",
        cooldownOk: true
      },
      targeting: {
        mode: "piece",
        validTilesProvider: "provider.enemiesInLineOfSight"
      },
      consumesTurn: true,
      cooldown: { perPiece: 2 }
    }]
  },
  state: {
    namespace: "rules.freezeMissile",
    initial: {}
  },
  parameters: {
    freezeKey: "frozen",
    freezeTurns: 2
  },
  logic: {
    effects: [
      {
        id: "fire-missile",
        when: "ui.special_freeze_missile",
        if: [
          "cooldown.ready",
          "ctx.hasTargetPiece",
          "target.isEnemy",
          ["not", ["target.hasStatus", "$params.freezeKey"]]
        ],
        do: [
          { action: "vfx.play", params: { sprite: "ice_projectile", tile: "$targetTile" } },
          { action: "audio.play", params: { id: "whoosh" } },
          { action: "vfx.play", params: { sprite: "ice_blast", tile: "$targetTile" } },
          {
            action: "status.add",
            params: {
              pieceId: "$targetPieceId",
              key: "$params.freezeKey",
              duration: "$params.freezeTurns"
            }
          },
          { action: "cooldown.set", params: { pieceId: "$pieceId", actionId: "special_freeze_missile", turns: 2 } },
          { action: "turn.end" }
        ],
        onFail: "blockAction",
        message: "Tir impossible."
      }
    ]
  }
};

export const quicksandRule: RuleJSON = {
  meta: {
    ruleId: "r_quicksand",
    ruleName: "Sable mouvant",
    isActive: true,
    category: "terrain",
    description: "Crée des pièges de sable qui capturent les pièces qui y entrent",
    tags: ["trap", "terrain", "capture"]
  },
  scope: {
    affectedPieces: ["pawn", "rook", "bishop", "knight", "queen", "king"],
    sides: ["white", "black"]
  },
  ui: {
    actions: [{
      id: "special_place_quicksand",
      label: "Poser sable mouvant",
      hint: "Place un piège de sable qui capture les pièces",
      icon: "🏜️",
      availability: {
        requiresSelection: true,
        phase: "main",
        cooldownOk: true
      },
      targeting: {
        mode: "tile",
        validTilesProvider: "provider.anyEmptyTile"
      },
      consumesTurn: true,
      cooldown: { perPiece: 2 }
    }]
  },
  state: {
    namespace: "rules.quicksand",
    initial: { traps: {} }
  },
  logic: {
    effects: [
      {
        id: "place-quicksand",
        when: "ui.special_place_quicksand",
        if: ["ctx.hasTargetTile", "tile.isEmpty", "cooldown.ready"],
        do: [
          { action: "tile.setTrap", params: { tile: "$targetTile", kind: "quicksand", sprite: "quicksand_tile" } },
          { action: "audio.play", params: { id: "sand" } },
          { action: "cooldown.set", params: { pieceId: "$pieceId", actionId: "special_place_quicksand", turns: 2 } },
          { action: "turn.end" }
        ]
      },
      {
        id: "trigger-on-enter",
        when: "lifecycle.onEnterTile",
        do: [
          { action: "tile.resolveTrap", params: { tile: "$to", persistent: false } }
        ]
      }
    ]
  }
};

export const invisibleRookRule: RuleJSON = {
  meta: {
    ruleId: "r_invisible_rook",
    ruleName: "Tour invisible",
    isActive: true,
    category: "stealth",
    description: "Les tours peuvent devenir invisibles à l'adversaire",
    tags: ["stealth", "invisibility"]
  },
  scope: {
    affectedPieces: ["rook"],
    sides: ["white", "black"]
  },
  ui: {
    actions: [{
      id: "special_toggle_invisibility",
      label: "Invisibilité",
      hint: "Rend la tour invisible pendant 3 tours",
      icon: "👻",
      availability: {
        requiresSelection: true,
        pieceTypes: ["rook"],
        phase: "main",
        cooldownOk: true
      },
      targeting: {
        mode: "none"
      },
      consumesTurn: false,
      cooldown: { perPiece: 1 }
    }]
  },
  logic: {
    effects: [
      {
        id: "toggle-stealth",
        when: "ui.special_toggle_invisibility",
        if: ["cooldown.ready", "piece.isTypeInScope"],
        do: [
          { action: "piece.setInvisible", params: { pieceId: "$pieceId", value: true } },
          { action: "audio.play", params: { id: "cloak" } },
          { action: "cooldown.set", params: { pieceId: "$pieceId", actionId: "special_toggle_invisibility", turns: 1 } },
          { action: "ui.toast", params: { message: "Tour devenue invisible!" } }
        ]
      }
    ]
  }
};

export const multiplyingQueenRule: RuleJSON = {
  meta: {
    ruleId: "r_multiplying_queen",
    ruleName: "Dame multiplicative",
    isActive: true,
    category: "spawn",
    description: "La dame peut se dupliquer sur une case voisine",
    tags: ["spawn", "duplicate"]
  },
  scope: {
    affectedPieces: ["queen"],
    sides: ["white", "black"]
  },
  ui: {
    actions: [{
      id: "special_duplicate_queen",
      label: "Se multiplier",
      hint: "Crée une copie de la dame sur une case voisine",
      icon: "👯",
      availability: {
        requiresSelection: true,
        pieceTypes: ["queen"],
        phase: "main",
        cooldownOk: true
      },
      targeting: {
        mode: "tile",
        validTilesProvider: "provider.neighborsEmpty"
      },
      consumesTurn: true,
      cooldown: { perPiece: 3 },
      maxPerPiece: 2
    }]
  },
  state: {
    namespace: "rules.multiplyingQueen",
    initial: { spawnedCount: {} }
  },
  logic: {
    effects: [
      {
        id: "duplicate",
        when: "ui.special_duplicate_queen",
        if: [
          "ctx.hasTargetTile",
          "tile.isEmpty",
          "cooldown.ready",
          "piece.isTypeInScope",
          ["state.lessThan", { path: "rules.multiplyingQueen.spawnedCount.$pieceId", value: 2 }]
        ],
        do: [
          { action: "piece.duplicate", params: { sourceId: "$pieceId", tile: "$targetTile" } },
          { action: "vfx.play", params: { sprite: "spawn_flash", tile: "$targetTile" } },
          { action: "audio.play", params: { id: "spawn" } },
          { action: "cooldown.set", params: { pieceId: "$pieceId", actionId: "special_duplicate_queen", turns: 3 } },
          { action: "state.inc", params: { path: "rules.multiplyingQueen.spawnedCount.$pieceId", by: 1, default: 0 } },
          { action: "turn.end" }
        ],
        onFail: "blockAction"
      }
    ]
  }
};

export const exampleRules: RuleJSON[] = [
  freezeMissileRule,
  quicksandRule,
  invisibleRookRule,
  multiplyingQueenRule
];
