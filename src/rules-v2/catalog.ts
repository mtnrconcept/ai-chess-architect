import type {
  ArgumentKind,
  ConditionOp,
  EffectOp,
  ProviderId,
  TargetingMode,
} from "./types";

export interface ArgumentSpec {
  kind: ArgumentKind | "scalar";
  required: boolean;
}

export interface OperationSpec {
  args: Record<string, ArgumentSpec>;
}

export interface ProviderSpec {
  /** Target values returned by the provider. Providers accept no model-defined arguments. */
  targetModes: readonly TargetingMode[];
  /** Whether the provider needs a selected source piece in the engine context. */
  requiresPiece: boolean;
}

const req = (kind: ArgumentSpec["kind"]): ArgumentSpec => ({
  kind,
  required: true,
});

const opt = (kind: ArgumentSpec["kind"]): ArgumentSpec => ({
  kind,
  required: false,
});

export const CONDITION_CATALOG: Record<ConditionOp, OperationSpec> = {
  always: { args: {} },
  "ctx.hasTargetTile": { args: {} },
  "ctx.hasTargetPiece": { args: {} },
  "cooldown.ready": {
    args: {
      pieceId: opt("scalar"),
      actionId: opt("string"),
    },
  },
  "tile.isEmpty": { args: {} },
  "tile.withinBoard": { args: {} },
  "piece.isTypeInScope": { args: {} },
  "piece.hasMoved.equals": {
    args: {
      expected: req("boolean"),
    },
  },
  "status.targetNotFrozen": { args: {} },
  "piece.exists": { args: {} },
  "piece.isSide": {
    args: {
      side: req("scalar"),
    },
  },
  "piece.hasStatus": {
    args: {
      key: req("string"),
    },
  },
  "target.hasStatus": {
    args: {
      key: req("string"),
    },
  },
  "target.isEnemy": { args: {} },
  "target.isFriendly": { args: {} },
  "state.exists": {
    args: {
      path: req("string"),
    },
  },
  "state.equals": {
    args: {
      path: req("string"),
      value: req("scalar"),
    },
  },
  "state.lessThan": {
    args: {
      path: req("string"),
      value: req("number"),
    },
  },
  "random.chance": {
    args: {
      percent: req("number"),
    },
  },
  "match.turnNumber.atLeast": {
    args: {
      value: req("number"),
    },
  },
  "match.turnNumber.lessThan": {
    args: {
      value: req("number"),
    },
  },
};

export const EFFECT_CATALOG: Record<EffectOp, OperationSpec> = {
  "vfx.play": {
    args: {
      sprite: req("string"),
      tile: req("scalar"),
    },
  },
  "audio.play": {
    args: {
      id: req("string"),
    },
  },
  "decal.set": {
    args: {
      tile: req("scalar"),
      sprite: req("string"),
    },
  },
  "decal.clear": {
    args: {
      tile: req("scalar"),
    },
  },
  "turn.end": { args: {} },
  "cooldown.set": {
    args: {
      pieceId: req("scalar"),
      actionId: req("string"),
      turns: req("number"),
    },
  },
  "piece.capture": {
    args: {
      pieceId: req("scalar"),
      reason: opt("string"),
    },
  },
  "piece.move": {
    args: {
      pieceId: req("scalar"),
      to: req("scalar"),
    },
  },
  "piece.spawn": {
    args: {
      type: req("string"),
      side: req("scalar"),
      tile: req("scalar"),
    },
  },
  "piece.promote": {
    args: {
      pieceId: opt("scalar"),
      toType: req("string"),
    },
  },
  "piece.duplicate": {
    args: {
      sourceId: req("scalar"),
      tile: req("scalar"),
    },
  },
  "piece.setInvisible": {
    args: {
      pieceId: req("scalar"),
      value: req("boolean"),
    },
  },
  "piece.setStatus": {
    args: {
      pieceId: req("scalar"),
      key: req("string"),
      value: req("scalar"),
    },
  },
  "piece.clearStatus": {
    args: {
      pieceId: req("scalar"),
      key: req("string"),
    },
  },
  "tile.setTrap": {
    args: {
      tile: req("scalar"),
      kind: req("string"),
      owner: opt("scalar"),
      sprite: opt("string"),
    },
  },
  "tile.clearTrap": {
    args: {
      tile: req("scalar"),
    },
  },
  "tile.resolveTrap": {
    args: {
      tile: req("scalar"),
      persistent: opt("boolean"),
    },
  },
  "ui.toast": {
    args: {
      message: req("string"),
    },
  },
  "status.add": {
    args: {
      pieceId: req("scalar"),
      key: req("string"),
      duration: req("number"),
    },
  },
  "status.remove": {
    args: {
      pieceId: req("scalar"),
      key: req("string"),
    },
  },
  "state.set": {
    args: {
      path: req("string"),
      value: req("scalar"),
    },
  },
  "state.inc": {
    args: {
      path: req("string"),
      by: opt("number"),
      default: opt("number"),
    },
  },
  "state.delete": {
    args: {
      path: req("string"),
    },
  },
};

/**
 * V2 intentionally exposes only contextual, zero-argument providers. This keeps
 * the model from inventing provider parameters that the UI cannot transport.
 * The compiler enforces the target type and selection requirement below.
 */
export const PROVIDER_CATALOG: Record<ProviderId, ProviderSpec> = {
  none: {
    targetModes: ["none"],
    requiresPiece: false,
  },
  "provider.anyEmptyTile": {
    targetModes: ["tile", "area"],
    requiresPiece: false,
  },
  "provider.neighborsEmpty": {
    targetModes: ["tile", "area"],
    requiresPiece: true,
  },
  "provider.allTiles": {
    targetModes: ["tile", "area"],
    requiresPiece: false,
  },
  "provider.tilesInRadius": {
    targetModes: ["tile", "area"],
    requiresPiece: true,
  },
  "provider.emptyTilesInRadius": {
    targetModes: ["tile", "area"],
    requiresPiece: true,
  },
  "provider.enemyPieces": {
    targetModes: ["piece"],
    requiresPiece: true,
  },
  "provider.friendlyPieces": {
    targetModes: ["piece"],
    requiresPiece: true,
  },
  "provider.piecesInRadius": {
    targetModes: ["piece"],
    requiresPiece: true,
  },
  "provider.enemiesInLineOfSight": {
    targetModes: ["piece"],
    requiresPiece: true,
  },
};

export const SAFE_TOKENS = new Set([
  "$pieceId",
  "$targetPieceId",
  "$targetTile",
  "$sourceTile",
  "$ctx.side",
  "$ctx.to",
  "$ctx.from",
  "$ctx.pieceId",
  "$ctx.targetTile",
  "$ctx.targetPieceId",
]);

export const STATE_PATH_PATTERN =
  /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*){0,5}$/;
