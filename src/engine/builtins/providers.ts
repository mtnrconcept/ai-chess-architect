import { Registry, type EngineContext } from "../registry";
import type { PieceID, Tile } from "../types";

const BOARD_TILE = /^[a-h][1-8]$/;

const sourceTile = (ctx: EngineContext): Tile | null => {
  const tile = ctx.piece?.tile;
  return typeof tile === "string" && BOARD_TILE.test(tile) ? tile : null;
};

const allPieceIds = (ctx: EngineContext): PieceID[] => {
  const board = ctx.engine.board;
  const ids = board
    .tiles()
    .map((tile: Tile) => board.getPieceAt(tile))
    .filter((id: PieceID | null): id is PieceID => id !== null);
  return [...new Set(ids)];
};

/**
 * Rule Architect providers are deliberately contextual and zero-argument.
 * Their output type is fixed by PROVIDER_CATALOG and checked again by the UI.
 */
export function registerBuiltinProviders(registry: Registry): void {
  registry.registerProvider("provider.anyEmptyTile", (ctx) => {
    const board = ctx.engine.board;
    return board
      .tiles()
      .filter((tile: Tile) => board.withinBoard(tile) && board.isEmpty(tile));
  });

  registry.registerProvider("provider.neighborsEmpty", (ctx) => {
    const center = sourceTile(ctx);
    if (!center) return [];
    const board = ctx.engine.board;
    return board
      .neighbors(center, 1)
      .filter((tile: Tile) => board.withinBoard(tile) && board.isEmpty(tile));
  });

  registry.registerProvider("provider.allTiles", (ctx) =>
    ctx.engine.board
      .tiles()
      .filter((tile: Tile) => ctx.engine.board.withinBoard(tile)),
  );

  registry.registerProvider("provider.tilesInRadius", (ctx) => {
    const center = sourceTile(ctx);
    return center
      ? ctx.engine.board
          .neighbors(center, 1)
          .filter((tile: Tile) => ctx.engine.board.withinBoard(tile))
      : [];
  });

  registry.registerProvider("provider.emptyTilesInRadius", (ctx) => {
    const center = sourceTile(ctx);
    if (!center) return [];
    const board = ctx.engine.board;
    return board
      .neighbors(center, 1)
      .filter((tile: Tile) => board.withinBoard(tile) && board.isEmpty(tile));
  });

  registry.registerProvider("provider.enemyPieces", (ctx) => {
    if (!ctx.piece) return [];
    return allPieceIds(ctx).filter(
      (id) => ctx.engine.board.getPiece(id).side !== ctx.piece.side,
    );
  });

  registry.registerProvider("provider.friendlyPieces", (ctx) => {
    if (!ctx.piece) return [];
    return allPieceIds(ctx).filter(
      (id) => ctx.engine.board.getPiece(id).side === ctx.piece.side,
    );
  });

  registry.registerProvider("provider.piecesInRadius", (ctx) => {
    const center = sourceTile(ctx);
    if (!center) return [];
    return ctx.engine.board
      .neighbors(center, 1)
      .map((tile: Tile) => ctx.engine.board.getPieceAt(tile))
      .filter((id: PieceID | null): id is PieceID => id !== null);
  });

  registry.registerProvider("provider.enemiesInLineOfSight", (ctx) => {
    const center = sourceTile(ctx);
    if (!center || !ctx.piece) return [];

    const board = ctx.engine.board;
    const start = tileToPosition(center);
    const targets: PieceID[] = [];
    const directions = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const;

    for (const [rowDelta, columnDelta] of directions) {
      for (let distance = 1; distance <= 8; distance += 1) {
        const row = start.row + rowDelta * distance;
        const column = start.column + columnDelta * distance;
        if (row < 0 || row >= 8 || column < 0 || column >= 8) break;

        const targetTile = positionToTile(row, column);
        const pieceId = board.getPieceAt(targetTile);
        if (!pieceId) continue;

        if (board.getPiece(pieceId).side !== ctx.piece.side) {
          targets.push(pieceId);
        }
        break;
      }
    }

    return targets;
  });
}

function tileToPosition(tile: Tile): { row: number; column: number } {
  return {
    row: 8 - Number.parseInt(tile[1], 10),
    column: tile.charCodeAt(0) - 97,
  };
}

function positionToTile(row: number, column: number): Tile {
  return `${String.fromCharCode(97 + column)}${8 - row}`;
}
