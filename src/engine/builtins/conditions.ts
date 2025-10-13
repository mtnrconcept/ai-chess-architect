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
}
