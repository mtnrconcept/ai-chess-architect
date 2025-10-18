import { Registry } from "../registry";

export function registerBuiltinConditions(reg: Registry) {
  reg.registerCondition("always", () => true);

  reg.registerCondition("ctx.hasTargetTile", (ctx) => !!ctx.targetTile);

  reg.registerCondition("cooldown.ready", (ctx) => {
    if (!ctx.piece || !ctx.rule || !ctx.baseActionId) return true;
    return ctx.engine.cooldown.isReady(ctx.piece.id, ctx.baseActionId);
  });

  reg.registerCondition("tile.isEmpty", (ctx) => {
    if (!ctx.targetTile) return false;
    return ctx.engine.board.isEmpty(ctx.targetTile);
  });

  reg.registerCondition("piece.isTypeInScope", (ctx) => {
    if (!ctx.piece || !ctx.rule?.scope?.affectedPieces) return true;
    return ctx.rule.scope.affectedPieces.includes(ctx.piece.type);
  });

  reg.registerCondition("status.targetNotFrozen", (ctx) => {
    if (!ctx.targetPieceId) return true;
    const p = ctx.engine.board.getPiece(ctx.targetPieceId);
    return !(p.statuses?.frozen);
  });

  reg.registerCondition("random.50", () => Math.random() < 0.5);

  reg.registerCondition("piece.exists", (ctx) => {
    if (!ctx.pieceId) return false;
    try {
      const piece = ctx.engine.board.getPiece(ctx.pieceId);
      return !!piece;
    } catch {
      return false;
    }
  });

  reg.registerCondition("tile.withinBoard", (ctx) => {
    if (!ctx.targetTile) return false;
    return ctx.engine.board.withinBoard(ctx.targetTile);
  });

  reg.registerCondition("piece.isSide", (ctx) => {
    if (!ctx.piece || !ctx.params?.side) return true;
    return ctx.piece.side === ctx.params.side;
  });

  // Phase 1: Status management conditions
  reg.registerCondition("piece.hasStatus", (ctx) => {
    const key = ctx.params?.statusKey || ctx.params?.key;
    if (!ctx.pieceId || !key) return false;
    try {
      const piece = ctx.engine.board.getPiece(ctx.pieceId);
      return !!(piece.statuses?.[key]?.active);
    } catch {
      return false;
    }
  });

  reg.registerCondition("target.hasStatus", (ctx) => {
    let key = ctx.params?.statusKey || ctx.params?.key;
    
    // Résoudre les références $params.*
    if (typeof key === 'string' && key.startsWith('$params.')) {
      const paramPath = key.slice(8); // "freezeKey" depuis "$params.freezeKey"
      key = ctx.params?.[paramPath];
    }
    
    if (!ctx.targetPieceId || !key) return false;
    try {
      const piece = ctx.engine.board.getPiece(ctx.targetPieceId);
      return !!(piece.statuses?.[key]?.active);
    } catch {
      return false;
    }
  });

  // Phase 2: Advanced targeting conditions
  reg.registerCondition("ctx.hasTargetPiece", (ctx) => {
    const hasTarget = !!ctx.targetPieceId;
    if (!hasTarget) {
      console.warn("[condition] ctx.hasTargetPiece failed - no targetPieceId in context");
    }
    return hasTarget;
  });

  reg.registerCondition("target.isEnemy", (ctx) => {
    if (!ctx.targetPieceId || !ctx.piece) return false;
    try {
      const target = ctx.engine.board.getPiece(ctx.targetPieceId);
      return target.side !== ctx.piece.side;
    } catch {
      return false;
    }
  });

  reg.registerCondition("target.isFriendly", (ctx) => {
    if (!ctx.targetPieceId || !ctx.piece) return false;
    try {
      const target = ctx.engine.board.getPiece(ctx.targetPieceId);
      return target.side === ctx.piece.side;
    } catch {
      return false;
    }
  });

  // Phase 3: State management conditions
  reg.registerCondition("state.exists", (ctx) => {
    const path = ctx.params?.path;
    if (!path) return false;
    
    const keys = path.split('.');
    let current = ctx.state;
    
    for (const key of keys) {
      if (!current || typeof current !== 'object') return false;
      current = current[key];
    }
    
    return current !== undefined;
  });

  reg.registerCondition("state.equals", (ctx) => {
    const path = ctx.params?.path;
    const value = ctx.params?.value;
    if (!path) return false;
    
    const keys = path.split('.');
    let current = ctx.state;
    
    for (const key of keys) {
      if (!current || typeof current !== 'object') return false;
      current = current[key];
    }
    
    return current === value;
  });

  reg.registerCondition("state.lessThan", (ctx) => {
    const path = ctx.params?.path;
    const value = ctx.params?.value;
    if (!path || value === undefined) return false;
    
    const keys = path.split('.');
    let current = ctx.state;
    
    for (const key of keys) {
      if (!current || typeof current !== 'object') return false;
      current = current[key];
    }
    
    return typeof current === 'number' && current < value;
  });

  // Phase 4: Probabilistic conditions
  reg.registerCondition("random.chance", (ctx) => {
    const percent = ctx.params?.percent ?? 50;
    return Math.random() * 100 < percent;
  });
}
