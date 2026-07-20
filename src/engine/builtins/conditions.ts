import type { EngineContext } from "../registry";
import { Registry } from "../registry";

const FORBIDDEN_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const asParams = (args: unknown[]): Record<string, unknown> => {
  const first = args[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : {};
};

const argument = (
  ctx: EngineContext,
  args: unknown[],
  name: string,
  positionalIndex = 0,
): unknown => {
  const params = asParams(args);
  if (Object.prototype.hasOwnProperty.call(params, name)) {
    return params[name];
  }
  if (args[positionalIndex] !== undefined) {
    return args[positionalIndex];
  }
  return ctx.params?.[name];
};

const readStatePath = (
  state: Record<string, unknown>,
  path: unknown,
): unknown => {
  if (typeof path !== "string" || path.length === 0) {
    return undefined;
  }

  const segments = path.split(".");
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    return undefined;
  }

  let current: unknown = state;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const isStatusActive = (
  statuses: Record<string, unknown> | undefined,
  key: unknown,
): boolean => {
  if (!statuses || typeof key !== "string" || !key) {
    return false;
  }

  const status = statuses[key];
  if (status && typeof status === "object" && "active" in status) {
    return Boolean((status as { active?: boolean }).active);
  }
  return Boolean(status);
};

export function registerBuiltinConditions(registry: Registry): void {
  registry.registerCondition("always", () => true);

  registry.registerCondition("ctx.hasTargetTile", (ctx) =>
    Boolean(ctx.targetTile),
  );

  registry.registerCondition("ctx.hasTargetPiece", (ctx) =>
    Boolean(ctx.targetPieceId),
  );

  registry.registerCondition("cooldown.ready", (ctx, ...args) => {
    const pieceId =
      argument(ctx, args, "pieceId", 0) ?? ctx.piece?.id ?? ctx.pieceId;
    const actionId = argument(ctx, args, "actionId", 1) ?? ctx.baseActionId;

    if (typeof pieceId !== "string" || typeof actionId !== "string") {
      return false;
    }

    return Boolean(ctx.engine.cooldown.isReady(pieceId, actionId));
  });

  registry.registerCondition("tile.isEmpty", (ctx) => {
    if (typeof ctx.targetTile !== "string") {
      return false;
    }
    return Boolean(ctx.engine.board.isEmpty(ctx.targetTile));
  });

  registry.registerCondition("tile.withinBoard", (ctx) => {
    if (typeof ctx.targetTile !== "string") {
      return false;
    }
    return Boolean(ctx.engine.board.withinBoard(ctx.targetTile));
  });

  registry.registerCondition("piece.isTypeInScope", (ctx) => {
    if (!ctx.piece) {
      return false;
    }

    const affectedPieces = ctx.rule?.scope?.affectedPieces;
    if (
      !Array.isArray(affectedPieces) ||
      affectedPieces.length === 0 ||
      affectedPieces.includes("any")
    ) {
      return true;
    }
    return affectedPieces.includes(ctx.piece.type);
  });

  registry.registerCondition("piece.hasMoved.equals", (ctx, ...args) => {
    if (!ctx.piece) {
      return false;
    }
    const expected = argument(ctx, args, "expected", 0);
    if (typeof expected !== "boolean") {
      return false;
    }
    return Boolean(ctx.piece.hasMoved) === expected;
  });

  registry.registerCondition("status.targetNotFrozen", (ctx) => {
    if (!ctx.targetPieceId) {
      return false;
    }
    try {
      const piece = ctx.engine.board.getPiece(ctx.targetPieceId);
      return !isStatusActive(piece.statuses, "frozen");
    } catch {
      return false;
    }
  });

  registry.registerCondition("piece.exists", (ctx) => {
    const pieceId = ctx.pieceId ?? ctx.piece?.id;
    if (!pieceId) {
      return false;
    }
    try {
      return Boolean(ctx.engine.board.getPiece(pieceId));
    } catch {
      return false;
    }
  });

  registry.registerCondition("piece.isSide", (ctx, ...args) => {
    const side = argument(ctx, args, "side", 0);
    if (!ctx.piece || (side !== "white" && side !== "black")) {
      return false;
    }
    return ctx.piece.side === side;
  });

  registry.registerCondition("piece.hasStatus", (ctx, ...args) => {
    const key = argument(ctx, args, "key", 0);
    const pieceId = ctx.pieceId ?? ctx.piece?.id;
    if (!pieceId) {
      return false;
    }
    try {
      const piece = ctx.engine.board.getPiece(pieceId);
      return isStatusActive(piece.statuses, key);
    } catch {
      return false;
    }
  });

  registry.registerCondition("target.hasStatus", (ctx, ...args) => {
    const key = argument(ctx, args, "key", 0);
    if (!ctx.targetPieceId) {
      return false;
    }
    try {
      const piece = ctx.engine.board.getPiece(ctx.targetPieceId);
      return isStatusActive(piece.statuses, key);
    } catch {
      return false;
    }
  });

  registry.registerCondition("target.isEnemy", (ctx) => {
    if (!ctx.targetPieceId || !ctx.piece) {
      return false;
    }
    try {
      const target = ctx.engine.board.getPiece(ctx.targetPieceId);
      return target.side !== ctx.piece.side;
    } catch {
      return false;
    }
  });

  registry.registerCondition("target.isFriendly", (ctx) => {
    if (!ctx.targetPieceId || !ctx.piece) {
      return false;
    }
    try {
      const target = ctx.engine.board.getPiece(ctx.targetPieceId);
      return target.side === ctx.piece.side;
    } catch {
      return false;
    }
  });

  registry.registerCondition("state.exists", (ctx, ...args) => {
    const path = argument(ctx, args, "path", 0);
    return readStatePath(ctx.state, path) !== undefined;
  });

  registry.registerCondition("state.equals", (ctx, ...args) => {
    const path = argument(ctx, args, "path", 0);
    const value = argument(ctx, args, "value", 1);
    return Object.is(readStatePath(ctx.state, path), value);
  });

  registry.registerCondition("state.lessThan", (ctx, ...args) => {
    const path = argument(ctx, args, "path", 0);
    const value = argument(ctx, args, "value", 1);
    const current = readStatePath(ctx.state, path);
    return (
      typeof current === "number" &&
      typeof value === "number" &&
      current < value
    );
  });

  const randomChance = (ctx: EngineContext, ...args: unknown[]): boolean => {
    if (!ctx.random) {
      console.error("[RuleEngine] RNG déterministe absent du contexte.");
      return false;
    }

    const rawPercent = argument(ctx, args, "percent", 0) ?? 50;
    if (typeof rawPercent !== "number" || !Number.isFinite(rawPercent)) {
      return false;
    }

    const percent = Math.min(100, Math.max(0, rawPercent));
    return ctx.random() * 100 < percent;
  };

  registry.registerCondition("random.chance", randomChance);

  registry.registerCondition("random.50", (ctx) =>
    randomChance(ctx, { percent: 50 }),
  );

  registry.registerCondition("match.turnNumber.atLeast", (ctx, ...args) => {
    const value = argument(ctx, args, "value", 0);
    if (typeof value !== "number") {
      return false;
    }
    const match = ctx.engine.match.get?.();
    const ply = typeof match?.ply === "number" ? match.ply : 0;
    return ply >= value;
  });

  registry.registerCondition("match.turnNumber.lessThan", (ctx, ...args) => {
    const value = argument(ctx, args, "value", 0);
    if (typeof value !== "number") {
      return false;
    }
    const match = ctx.engine.match.get?.();
    const ply = typeof match?.ply === "number" ? match.ply : 0;
    return ply < value;
  });
}
