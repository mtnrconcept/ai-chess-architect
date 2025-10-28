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
  const rule: RuleJSON = {
    meta,
    scope: buildScope(intent),
    logic: {
      effects: [
        {
          id: `${meta.ruleId}_after_move`,
          when: "lifecycle.afterMove",
          if: [["piece.isType", "$pieceId", "pawn"]],
          do: [
            {
              action: "hazard.spawn",
              params: {
                type: "mine",
                tile: "$toTile",
                payload: { armedBy: "$pieceId" },
              },
            },
            {
              action: "vfx.play",
              params: { tile: "$toTile", sprite: "mine_arm" },
            },
            { action: "audio.play", params: { id: "arm_click" } },
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
            ? {
                mode:
                  intent.targeting.mode === "none"
                    ? "none"
                    : intent.targeting.mode,
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
