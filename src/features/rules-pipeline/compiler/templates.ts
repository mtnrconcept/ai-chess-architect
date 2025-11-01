import type { RuleJSON } from "@/engine/types";
import type { CanonicalIntent } from "../schemas/canonicalIntent";
import { slugify } from "../utils/slugify";

const buildMeta = (intent: CanonicalIntent) => ({
  ruleId: `r_${slugify(intent.ruleName)}`,
  ruleName: intent.ruleName,
  category: intent.category ?? "custom",
  isActive: true,
  tags: Array.from(
    new Set([
      ...(intent.hazards ?? []),
      ...(intent.statuses ?? []),
      ...intent.mechanics,
      ...intent.affectedPieces,
    ]),
  ),
});

const buildScope = (intent: CanonicalIntent): RuleJSON["scope"] => ({
  affectedPieces: intent.affectedPieces,
  sides: ["white", "black"],
});

const buildCooldown = (intent: CanonicalIntent) =>
  intent.limits?.cooldownPerPiece
    ? { perPiece: intent.limits.cooldownPerPiece }
    : undefined;

const guardKingSafety = (intent: CanonicalIntent) =>
  intent.requirements?.kingSafety ||
  intent.mechanics.some((mechanic) =>
    [
      "teleport",
      "swap",
      "morph",
      "projectile",
      "piece.move",
      "piece.capture",
    ].some((keyword) => mechanic.includes(keyword)),
  );

const defaultGuards = (
  intent: CanonicalIntent,
  pieceType: string,
  actionId?: string,
  extraGuards: GuardExpression[] = [],
): GuardExpression[] => {
  const guards: GuardExpression[] =
    pieceType === "*"
      ? ["piece.isTypeInScope"]
      : ([["piece.isType", "$pieceId", pieceType]] as GuardExpression[]);
  if (actionId) {
    guards.push(["cooldown.ready", "$pieceId", actionId]);
  }
  if (guardKingSafety(intent)) {
    guards.push(["rules.kingSafeAfter", { simulate: "applyAfter" }]);
  }
  return guards.concat(extraGuards);
};

type GuardExpression =
  | string
  | [string, ...unknown[]]
  | Record<string, unknown>;

type TemplateCompiler = (intent: CanonicalIntent) => RuleJSON;

const pawnMines: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const namespace = "rules.pawnMines";
  const actionId = "special_place_mine";
  const targeting = intent.targeting
    ? {
        mode: intent.targeting.mode === "none" ? "none" : "tile",
        validTilesProvider: intent.targeting.provider,
      }
    : {
        mode: "tile" as const,
        validTilesProvider: `${namespace}.getValidTiles`,
      };

  const cooldown = buildCooldown(intent) ?? { perPiece: 1 };
  const maxPerPiece = intent.limits?.chargesPerMatch;

  const handlers: Record<string, string> = {
    [`ui.${actionId}`]: `${namespace}.handlePlaceMineAction`,
    "lifecycle.onEnterTile": `${namespace}.handleEnterTile`,
    "lifecycle.onMoveCommitted": `${namespace}.handleMoveCommitted`,
    "lifecycle.onUndo": `${namespace}.handleUndo`,
    "lifecycle.onPromote": `${namespace}.handlePromote`,
    "persistence.onSerialize": `${namespace}.serialize`,
    "persistence.onDeserialize": `${namespace}.deserialize`,
  };

  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "💣",
          hint: "Utilise ton tour pour miner une case adjacente.",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
            hasMovesRemaining: true,
          },
          targeting: targeting as { mode: "area" | "none" | "piece" | "tile"; validTilesProvider?: string },
          consumesTurn: true,
          cooldown,
          ...(maxPerPiece ? { maxPerPiece } : {}),
        },
      ],
    },
    assets: {
      sprites: {
        mine_idle: { src: "vfx/mine_idle.webp", anchor: "center", zIndex: 3 },
        mine_warning: {
          src: "vfx/mine_warning.webp",
          anchor: "center",
          zIndex: 4,
        },
        explosion: {
          src: "vfx/explosion_sheet.webp",
          fps: 24,
          frames: 16,
          zIndex: 6,
        },
      },
      audio: {
        place: { src: "sfx/mine_place.wav", volume: 0.7 },
        arm: { src: "sfx/mine_arm.wav", volume: 0.6 },
        boom: { src: "sfx/mine_explode.wav", volume: 0.9 },
      },
    },
    state: {
      namespace,
      initial: { mines: [] },
      serialize: true,
    },
    parameters: {
      visibility: "all",
      friendlyFire: true,
      armDelayPly: 0,
      detonation: {
        trigger: "onEnterTile",
        radius: 0,
        capturePriority: "mineFirst",
      },
      placement: {
        onlyEmptyTile: true,
        forbidCurrentTile: false,
        forbidOccupiedByAlly: true,
        forbidOccupiedByEnemy: true,
        forbidKingZone: false,
        forbidLastRank: false,
        allowedOffsets: "boardAny",
      },
      limits: {
        maxMinesPerPawn: maxPerPiece ?? 3,
        globalMaxMines: 16,
      },
      undo: { restoreMines: true },
      promotion: { minesPersistAfterPromotion: true },
      stacking: { allowMultipleOnSameTile: false },
    },
    events: [
      {
        id: "placeMine",
        emit: `${namespace}.placeMine`,
        payload: { pieceId: "string", from: "tile", to: "tile" },
      },
      {
        id: "explodeMine",
        emit: `${namespace}.explodeMine`,
        payload: { mineId: "string", tile: "tile", victimId: "string|null" },
      },
    ],
    handlers,
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "pawn", actionId, [
            "ctx.hasTargetTile",
            "tile.isEmpty",
          ]),
          do: [
            {
              action: "hazard.spawn",
              params: {
                type: "mine",
                tile: "$ctx.targetTile",
                payload: { owner: "$ctx.piece.side", armed: true },
              },
            },
            {
              action: "vfx.play",
              params: { tile: "$ctx.targetTile", sprite: "mine_idle" },
            },
            { action: "audio.play", params: { id: "place" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$ctx.piece.id",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 1,
              },
            },
            { action: "turn.end" },
          ],
          onFail: "blockAction",
          message: "Impossible de poser une mine ici.",
        },
        {
          id: "pawn_mines_trigger_on_enter",
          when: "lifecycle.onEnterTile",
          do: [
            {
              action: "hazard.resolve",
              params: { type: "mine", tile: "$ctx.to", cause: "enter" },
            },
          ],
        },
      ],
    },
  };
  return rule;
};

const bishopBlink: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_bishop_blink";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "✦",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? {
                mode: intent.targeting.mode === "none" ? "none" : "tile",
                validTilesProvider: intent.targeting.provider,
              }
            : undefined,
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "bishop", actionId, [
            "ctx.hasTargetTile",
            ["rules.pathClear", {}],
          ]),
          do: [
            {
              action: "piece.teleport",
              params: { pieceId: "$pieceId", to: "$targetTile" },
            },
            {
              action: "vfx.play",
              params: { tile: "$targetTile", sprite: "warp_blink" },
            },
            { action: "audio.play", params: { id: "warp" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 0,
              },
            },
            { action: "turn.end" },
          ],
          onFail: "blockAction",
          message: "Téléportation impossible.",
        },
      ],
    },
  };
  return rule;
};

const queenIceMissile: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_ice_missile";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "❄️",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? {
                mode: "tile",
                validTilesProvider: intent.targeting.provider,
              }
            : undefined,
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "queen", actionId, [
            "ctx.hasTargetTile",
            ["target.isEnemy", "$targetPieceId"],
          ]),
          do: [
            {
              action: "projectile.spawn",
              params: { path: "$path", vfx: "ice_trail", sfx: "ice_cast" },
            },
            {
              action: "status.apply",
              params: { pieceId: "$targetPieceId", status: "frozen", turns: 2 },
            },
            {
              action: "vfx.play",
              params: { tile: "$targetTile", sprite: "ice_burst" },
            },
            { action: "audio.play", params: { id: "freeze_pop" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 3,
              },
            },
            { action: "turn.end" },
          ],
          onFail: "blockAction",
          message: "Cible invalide.",
        },
      ],
    },
  };
  return rule;
};

const knightQuicksand: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_knight_quicksand";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "🏜️",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? {
                mode: "tile",
                validTilesProvider: intent.targeting.provider,
              }
            : undefined,
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "knight", actionId, ["ctx.hasTargetTile"]),
          do: [
            {
              action: "hazard.spawn",
              params: {
                type: "quicksand",
                tile: "$targetTile",
                payload: { slow: 2, captureOnStay: false },
                ttl: intent.limits?.duration ?? 3,
              },
            },
            {
              action: "vfx.play",
              params: { tile: "$targetTile", sprite: "sand_swirl" },
            },
            { action: "audio.play", params: { id: "rustle" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 3,
              },
            },
            { action: "turn.end" },
          ],
        },
      ],
    },
  };
  return rule;
};

const pawnWall: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_pawn_wall";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "🧱",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? {
                mode: "area",
                validTilesProvider: intent.targeting.provider,
              }
            : undefined,
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "pawn", actionId, ["ctx.hasTargetArea"]),
          do: [
            {
              action: "hazard.spawn",
              params: {
                type: "wall",
                area: "$targetArea",
                payload: { blocksMovement: true },
                ttl: intent.limits?.duration ?? 3,
              },
            },
            {
              action: "vfx.play",
              params: { area: "$targetArea", sprite: "wall_raise" },
            },
            { action: "audio.play", params: { id: "stone_growl" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 4,
              },
            },
            { action: "turn.end" },
          ],
        },
      ],
    },
  };
  return rule;
};

const knightArcher: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_knight_morph";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "🏹",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: { mode: "none" },
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "knight", actionId),
          do: [
            {
              action: "piece.morph",
              params: { pieceId: "$pieceId", to: "archer" },
            },
            {
              action: "vfx.play",
              params: { tile: "$pieceTile", sprite: "morph_flash" },
            },
            { action: "audio.play", params: { id: "transmute" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 5,
              },
            },
            { action: "turn.end" },
          ],
        },
      ],
    },
    parameters: {
      newProfile: "archer",
    },
  };
  return rule;
};

const bishopSwap: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_bishop_swap";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "🔄",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? ({
                mode:
                  intent.targeting.mode === "none"
                    ? "none"
                    : (intent.targeting.mode as "area" | "piece" | "tile"),
                validTilesProvider: intent.targeting.provider,
              } as { mode: "area" | "none" | "piece" | "tile"; validTilesProvider?: string })
            : undefined,
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "bishop", actionId, [
            "ctx.hasTargetPair",
            ["rules.noTargetKing", {}],
          ]),
          do: [
            { action: "piece.swap", params: { pair: "$targetPair" } },
            {
              action: "vfx.play",
              params: { tiles: "$targetPair", sprite: "swap_spin" },
            },
            { action: "audio.play", params: { id: "whoosh" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 3,
              },
            },
            { action: "turn.end" },
          ],
          onFail: "blockAction",
          message: "Permutation impossible.",
        },
      ],
    },
  };
  return rule;
};

const dynamiteOnce: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_dynamite";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "🧨",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? {
                mode: "tile",
                validTilesProvider: intent.targeting.provider,
              }
            : undefined,
          consumesTurn: true,
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, "*", actionId, [
            "ctx.hasTargetTile",
            ["resource.available", "dynamite_once"],
          ]),
          do: [
            {
              action: "hazard.spawn",
              params: {
                type: "dynamite",
                tile: "$targetTile",
                ttl: intent.limits?.duration ?? 2,
                payload: { radius: 1 },
              },
            },
            { action: "audio.play", params: { id: "fuse" } },
            {
              action: "vfx.play",
              params: { tile: "$targetTile", sprite: "dynamite_warn" },
            },
            {
              action: "resource.markUsed",
              params: { resourceId: "dynamite_once" },
            },
            { action: "turn.end" },
          ],
        },
        {
          id: `${actionId}_tick`,
          when: "lifecycle.onTurnStart",
          do: [{ action: "hazard.tick", params: { type: "dynamite" } }],
        },
        {
          id: `${actionId}_explode`,
          when: "hazard.expired",
          if: [["hazard.isType", "$hazardId", "dynamite"]],
          do: [
            {
              action: "hazard.explode",
              params: { hazardId: "$hazardId", radius: 1 },
            },
            { action: "audio.play", params: { id: "explosion" } },
            {
              action: "vfx.play",
              params: { tile: "$hazardTile", sprite: "dynamite_boom" },
            },
          ],
        },
      ],
    },
  };
  return rule;
};

const glueSlow: TemplateCompiler = (intent) => {
  const meta = buildMeta(intent);
  const actionId = "special_glue_field";
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    ui: {
      actions: [
        {
          id: actionId,
          label: intent.ruleName,
          icon: "🧪",
          availability: {
            requiresSelection: true,
            pieceTypes: intent.affectedPieces,
            phase: "main",
            cooldownOk: true,
          },
          targeting: intent.targeting
            ? {
                mode: "area",
                validTilesProvider: intent.targeting.provider,
              }
            : undefined,
          consumesTurn: true,
          cooldown: buildCooldown(intent),
        },
      ],
    },
    logic: {
      effects: [
        {
          id: `${actionId}_effect`,
          when: `ui.${actionId}`,
          if: defaultGuards(intent, intent.affectedPieces[0], actionId, [
            "ctx.hasTargetArea",
          ]),
          do: [
            {
              action: "hazard.spawn",
              params: {
                type: "glue",
                area: "$targetArea",
                payload: {
                  slow: { rook: 2, bishop: 2, queen: 2 },
                  applyStatus: "slowed",
                },
                ttl: intent.limits?.duration ?? 3,
              },
            },
            {
              action: "vfx.play",
              params: { area: "$targetArea", sprite: "goo_splash" },
            },
            { action: "audio.play", params: { id: "sticky" } },
            {
              action: "cooldown.set",
              params: {
                pieceId: "$pieceId",
                actionId,
                turns: intent.limits?.cooldownPerPiece ?? 3,
              },
            },
            { action: "turn.end" },
          ],
        },
      ],
    },
  };
  return rule;
};

export const templateCompilers: Record<string, TemplateCompiler> = {
  pawn_mines: pawnMines,
  bishop_blink: bishopBlink,
  queen_ice_missile: queenIceMissile,
  knight_quicksand: knightQuicksand,
  pawn_wall: pawnWall,
  knight_archer: knightArcher,
  bishop_swap: bishopSwap,
  dynamite_once: dynamiteOnce,
  glue_slow: glueSlow,
};
