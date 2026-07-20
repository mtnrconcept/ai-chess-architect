import { STATE_PATH_PATTERN } from "../../rules-v2/catalog";
import { Registry, type EngineContext } from "../registry";
import type { Piece, PieceID, Side, Tile } from "../types";

const BOARD_TILE = /^[a-h][1-8]$/;
// The V2 compiler applies the narrower lowercase form. Runtime keeps safe
// camelCase compatibility for already-published legacy rules.
const STATUS_KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const RESOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const PIECE_TYPES = new Set(["pawn", "knight", "bishop", "rook", "queen"]);
const PROMOTION_TYPES = new Set(["knight", "bishop", "rook", "queen"]);

const fail = (message: string): never => {
  throw new Error(message);
};

const stringParam = (
  params: Record<string, unknown> | undefined,
  name: string,
  pattern?: RegExp,
): string => {
  const value = params?.[name];
  if (
    typeof value !== "string" ||
    !value ||
    (pattern && !pattern.test(value))
  ) {
    return fail(`Paramètre ${name} invalide.`);
  }
  return value;
};

const optionalString = (
  params: Record<string, unknown> | undefined,
  name: string,
): string | undefined => {
  const value = params?.[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") return fail(`Paramètre ${name} invalide.`);
  return value;
};

const numberParam = (
  params: Record<string, unknown> | undefined,
  name: string,
  fallback?: number,
): number => {
  const value = params?.[name] ?? fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`Paramètre ${name} invalide.`);
  }
  return value;
};

const tileParam = (
  ctx: EngineContext,
  params: Record<string, unknown> | undefined,
  name: string,
): Tile => {
  const tile = stringParam(params, name, BOARD_TILE);
  if (!ctx.engine.board.withinBoard(tile)) {
    return fail(`Case ${tile} hors plateau.`);
  }
  return tile;
};

const pieceParam = (
  ctx: EngineContext,
  params: Record<string, unknown> | undefined,
  name: string,
): PieceID => {
  const id = stringParam(params, name);
  ctx.engine.board.getPiece(id);
  return id;
};

const statusKey = (params: Record<string, unknown> | undefined): string =>
  stringParam(params, "key", STATUS_KEY);

const afterCommit = (ctx: EngineContext, callback: () => void): void => {
  if (ctx.postCommit) {
    ctx.postCommit.push(callback);
  } else {
    callback();
  }
};

const isRuleArchitectContext = (ctx: EngineContext): boolean =>
  ctx.rule?.integration?.ruleArchitect?.source === "ai-blueprint";

const setPieceInvisible = (
  ctx: EngineContext,
  pieceId: PieceID,
  value: boolean,
): void => {
  const board = ctx.engine.board;
  if (typeof board.setPieceInvisible === "function") {
    board.setPieceInvisible(pieceId, value);
    return;
  }
  if (isRuleArchitectContext(ctx)) {
    return fail("L'adaptateur de plateau ne persiste pas l'invisibilité V2.");
  }
  board.getPiece(pieceId).invisible = value;
};

const setPieceStatus = (
  ctx: EngineContext,
  pieceId: PieceID,
  key: string,
  value: unknown,
): void => {
  const board = ctx.engine.board;
  if (typeof board.setPieceStatus === "function") {
    board.setPieceStatus(pieceId, key, value);
    return;
  }
  if (isRuleArchitectContext(ctx)) {
    return fail("L'adaptateur de plateau ne persiste pas les statuts V2.");
  }
  const piece = board.getPiece(pieceId);
  piece.statuses ??= {};
  piece.statuses[key] = structuredClone(value);
};

const clearPieceStatus = (
  ctx: EngineContext,
  pieceId: PieceID,
  key: string,
): void => {
  const board = ctx.engine.board;
  if (typeof board.clearPieceStatus === "function") {
    board.clearPieceStatus(pieceId, key);
    return;
  }
  if (isRuleArchitectContext(ctx)) {
    return fail("L'adaptateur de plateau ne persiste pas les statuts V2.");
  }
  delete board.getPiece(pieceId).statuses?.[key];
};

const stateParent = (
  state: Record<string, unknown>,
  path: string,
  create: boolean,
): { parent: Record<string, unknown>; key: string } | null => {
  if (!STATE_PATH_PATTERN.test(path)) return fail("Chemin d'état invalide.");
  const segments = path.split(".");
  const key = segments.pop();
  if (!key) return fail("Chemin d'état vide.");

  let current = state;
  for (const segment of segments) {
    const value = current[segment];
    if (value === undefined && create) {
      current[segment] = Object.create(null) as Record<string, unknown>;
    } else if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      if (!create) return null;
      return fail(`Le segment ${segment} n'est pas un objet d'état.`);
    }
    current = current[segment] as Record<string, unknown>;
  }
  return { parent: current, key };
};

export function registerBuiltinEffects(registry: Registry): void {
  registry.registerEffect("vfx.play", (ctx, params) => {
    const sprite = stringParam(params, "sprite", RESOURCE_ID);
    const tile = tileParam(ctx, params, "tile");
    afterCommit(ctx, () => ctx.engine.vfx.playAnimation(sprite, tile));
    return true;
  });

  registry.registerEffect("audio.play", (ctx, params) => {
    const id = stringParam(params, "id", RESOURCE_ID);
    afterCommit(ctx, () => ctx.engine.vfx.playAudio(id));
    return true;
  });

  registry.registerEffect("decal.set", (ctx, params) => {
    const tile = tileParam(ctx, params, "tile");
    const sprite = stringParam(params, "sprite", RESOURCE_ID);
    ctx.engine.board.setDecal(tile, sprite);
    return true;
  });

  registry.registerEffect("decal.clear", (ctx, params) => {
    ctx.engine.board.clearDecal(tileParam(ctx, params, "tile"));
    return true;
  });

  registry.registerEffect("turn.end", (ctx) => {
    ctx.turnEnded = true;
    return true;
  });

  registry.registerEffect("cooldown.set", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    const actionId = stringParam(params, "actionId");
    const turns = numberParam(params, "turns");
    if (!Number.isInteger(turns) || turns < 0 || turns > 100) {
      return fail("Durée de cooldown invalide.");
    }
    ctx.engine.cooldown.set(pieceId, actionId, turns);
    return true;
  });

  registry.registerEffect("piece.capture", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    ctx.engine.capturePiece(pieceId, optionalString(params, "reason"));
    return true;
  });

  registry.registerEffect("piece.move", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    const destination = tileParam(ctx, params, "to");
    if (!ctx.engine.board.isEmpty(destination)) {
      return fail("La case de destination n'est pas vide.");
    }
    ctx.engine.board.setPieceTile(pieceId, destination);
    return true;
  });

  registry.registerEffect("piece.spawn", (ctx, params) => {
    const type = stringParam(params, "type");
    const side = stringParam(params, "side") as Side;
    const tile = tileParam(ctx, params, "tile");
    if (!PIECE_TYPES.has(type) || (side !== "white" && side !== "black")) {
      return fail("Type ou camp de pièce invalide.");
    }
    if (!ctx.engine.board.isEmpty(tile))
      return fail("La case d'apparition est occupée.");
    ctx.engine.board.spawnPiece(type, side, tile);
    return true;
  });

  registry.registerEffect("piece.promote", (ctx, params) => {
    const pieceIdValue = params?.pieceId ?? ctx.pieceId;
    if (typeof pieceIdValue !== "string")
      return fail("Pièce à promouvoir absente.");
    const current = ctx.engine.board.getPiece(pieceIdValue);
    const toType = stringParam(params, "toType");
    if (!PROMOTION_TYPES.has(toType))
      return fail("Type de promotion invalide.");
    ctx.engine.board.removePiece(pieceIdValue);
    ctx.engine.board.spawnPiece(toType, current.side, current.tile);
    return true;
  });

  registry.registerEffect("piece.duplicate", (ctx, params) => {
    const sourceId = pieceParam(ctx, params, "sourceId");
    const tile = tileParam(ctx, params, "tile");
    if (!ctx.engine.board.isEmpty(tile))
      return fail("La case de duplication est occupée.");
    const source = ctx.engine.board.getPiece(sourceId);
    ctx.engine.board.spawnPiece(source.type, source.side, tile);
    return true;
  });

  registry.registerEffect("piece.setInvisible", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    if (typeof params?.value !== "boolean")
      return fail("Valeur d'invisibilité invalide.");
    setPieceInvisible(ctx, pieceId, params.value);
    return true;
  });

  registry.registerEffect("piece.setStatus", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    const key = statusKey(params);
    if (params?.value === undefined) return fail("Valeur de statut absente.");
    setPieceStatus(ctx, pieceId, key, params.value);
    return true;
  });

  registry.registerEffect("piece.clearStatus", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    clearPieceStatus(ctx, pieceId, statusKey(params));
    return true;
  });

  registry.registerEffect("tile.setTrap", (ctx, params) => {
    const tile = tileParam(ctx, params, "tile");
    const kind = stringParam(params, "kind");
    if (kind !== "quicksand") return fail("Type de piège non pris en charge.");
    const owner = params?.owner ?? ctx.engine.match.get().turnSide;
    if (owner !== "white" && owner !== "black")
      return fail("Propriétaire de piège invalide.");
    const traps = (ctx.state.traps ??= Object.create(null)) as Record<
      string,
      unknown
    >;
    if (typeof traps !== "object" || Array.isArray(traps))
      return fail("État de pièges invalide.");
    traps[tile] = { kind, owner };
    ctx.engine.board.setDecal(
      tile,
      optionalString(params, "sprite") ?? "trap_icon",
    );
    return true;
  });

  registry.registerEffect("tile.clearTrap", (ctx, params) => {
    const tile = tileParam(ctx, params, "tile");
    const traps = ctx.state.traps;
    if (traps && typeof traps === "object" && !Array.isArray(traps)) {
      delete (traps as Record<string, unknown>)[tile];
    }
    ctx.engine.board.clearDecal(tile);
    return true;
  });

  registry.registerEffect("tile.resolveTrap", (ctx, params) => {
    const tile = tileParam(ctx, params, "tile");
    const traps = ctx.state.traps;
    const trap =
      traps && typeof traps === "object"
        ? (traps as Record<string, { kind?: unknown }>)[tile]
        : undefined;
    if (!trap) return true;
    if (trap.kind !== "quicksand") return fail("Piège non pris en charge.");

    const pieceId = ctx.engine.board.getPieceAt(tile);
    if (pieceId) {
      ctx.engine.board.getPiece(pieceId);
      ctx.engine.capturePiece(pieceId, "quicksand");
    }
    if (params?.persistent !== true) {
      const cleared = registry.runEffect(
        { action: "tile.clearTrap", params: { tile } },
        ctx,
      );
      if (!cleared) return fail("Impossible de supprimer le piège résolu.");
    }
    afterCommit(ctx, () => {
      ctx.engine.vfx.playAnimation("quicksand_splash", tile);
      ctx.engine.vfx.playAudio("sink");
    });
    return true;
  });

  registry.registerEffect("ui.toast", (ctx, params) => {
    const message = stringParam(params, "message");
    afterCommit(ctx, () => ctx.engine.ui.toast(message));
    return true;
  });

  registry.registerEffect("status.add", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    const key = statusKey(params);
    const duration =
      params?.duration === undefined && !isRuleArchitectContext(ctx)
        ? -1
        : numberParam(params, "duration");
    if (!Number.isInteger(duration) || duration < -1 || duration > 100) {
      return fail("Durée de statut invalide.");
    }
    const metadata =
      params?.metadata &&
      typeof params.metadata === "object" &&
      !Array.isArray(params.metadata)
        ? structuredClone(params.metadata)
        : {};
    setPieceStatus(ctx, pieceId, key, {
      active: true,
      duration,
      metadata,
      appliedAt: ctx.engine.match.get().ply,
    });
    return true;
  });

  registry.registerEffect("status.remove", (ctx, params) => {
    const pieceId = pieceParam(ctx, params, "pieceId");
    clearPieceStatus(ctx, pieceId, statusKey(params));
    return true;
  });

  registry.registerEffect("state.set", (ctx, params) => {
    const path = stringParam(params, "path");
    if (params?.value === undefined) return fail("Valeur d'état absente.");
    const target = stateParent(ctx.state, path, true)!;
    target.parent[target.key] = params.value;
    return true;
  });

  registry.registerEffect("state.inc", (ctx, params) => {
    const path = stringParam(params, "path");
    const by = numberParam(params, "by", 1);
    const fallback = numberParam(params, "default", 0);
    if (!Number.isInteger(by) || !Number.isInteger(fallback)) {
      return fail("Compteur d'état invalide.");
    }
    const target = stateParent(ctx.state, path, true)!;
    const current = target.parent[target.key] ?? fallback;
    if (typeof current !== "number" || !Number.isFinite(current)) {
      return fail("La valeur d'état à incrémenter n'est pas numérique.");
    }
    target.parent[target.key] = current + by;
    return true;
  });

  registry.registerEffect("state.delete", (ctx, params) => {
    const path = stringParam(params, "path");
    const target = stateParent(ctx.state, path, false);
    if (target) delete target.parent[target.key];
    return true;
  });

  // Legacy-only operations stay registered for old rules, but are absent from
  // the V2 catalog. Recursive composites remain explicitly blocked by RuleEngine.
  registry.registerEffect("state.pushUndo", (ctx) => {
    ctx.engine.state.pushUndo();
    return true;
  });
  registry.registerEffect("board.capture", (ctx, params) => {
    const pieceId = params?.pieceId ?? ctx.targetPieceId;
    if (typeof pieceId !== "string") return fail("Pièce à capturer absente.");
    return registry.runEffect(
      { action: "piece.capture", params: { pieceId, reason: params?.reason } },
      ctx,
    );
  });
  registry.registerEffect("area.forEachTile", () => false);
  registry.registerEffect("composite", () => false);
  registry.registerEffect("board.areaEffect", () => false);
  registry.registerEffect("status.tickAll", (ctx) => {
    const side = ctx.params?.side ?? ctx.engine.match.get().turnSide;
    const board = ctx.engine.board;
    const pieceIds = board
      .tiles()
      .map((tile: Tile) => board.getPieceAt(tile))
      .filter((id: PieceID | null): id is PieceID => id !== null);

    for (const pieceId of new Set(pieceIds)) {
      const piece = board.getPiece(pieceId) as Piece;
      if (piece.side !== side || !piece.statuses) continue;
      for (const [key, rawStatus] of Object.entries(piece.statuses)) {
        if (!rawStatus || typeof rawStatus !== "object") continue;
        const status = rawStatus as { active?: boolean; duration?: number };
        if (
          status.active !== true ||
          typeof status.duration !== "number" ||
          status.duration <= 0
        ) {
          continue;
        }
        const duration = status.duration - 1;
        if (duration === 0) {
          clearPieceStatus(ctx, pieceId, key);
          afterCommit(ctx, () =>
            ctx.engine.eventBus.emit("status.expired", {
              pieceId,
              statusKey: key,
              tile: piece.tile,
            }),
          );
        } else {
          setPieceStatus(ctx, pieceId, key, { ...status, duration });
        }
      }
    }
    return true;
  });
}
