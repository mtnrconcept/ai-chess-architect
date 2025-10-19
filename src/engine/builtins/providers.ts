import { Registry } from "../registry";
import { Tile } from "../types";

export function registerBuiltinProviders(reg: Registry) {
  reg.registerProvider("provider.anyEmptyTile", (ctx) => {
    const b = ctx.engine.board;
    return b.tiles().filter((t: Tile) => b.isEmpty(t));
  });

  reg.registerProvider("provider.neighborsEmpty", (ctx, center: Tile, radius = 1) => {
    const b = ctx.engine.board;
    const targetTile = center ?? ctx.piece?.tile;
    if (!targetTile) return [];
    return b.neighbors(targetTile, radius).filter((t: Tile) => b.isEmpty(t));
  });

  reg.registerProvider("provider.allTiles", (ctx) => {
    return ctx.engine.board.tiles();
  });

  reg.registerProvider("provider.tilesInRadius", (ctx, center: Tile, radius = 1) => {
    if (!center) return [];
    return ctx.engine.board.neighbors(center, radius);
  });

  reg.registerProvider("provider.emptyTilesInRadius", (ctx, center: Tile, radius = 1) => {
    if (!center) return [];
    const b = ctx.engine.board;
    return b.neighbors(center, radius).filter((t: Tile) => b.isEmpty(t));
  });

  // Phase 2: Advanced piece targeting providers
  reg.registerProvider("provider.enemyPieces", (ctx) => {
    if (!ctx.piece) return [];
    const b = ctx.engine.board;
    return b.tiles()
      .map(t => b.getPieceAt(t))
      .filter(pid => pid !== null)
      .map(pid => b.getPiece(pid!))
      .filter(p => p.side !== ctx.piece!.side)
      .map(p => p.id);
  });

  reg.registerProvider("provider.friendlyPieces", (ctx) => {
    if (!ctx.piece) return [];
    const b = ctx.engine.board;
    return b.tiles()
      .map(t => b.getPieceAt(t))
      .filter(pid => pid !== null)
      .map(pid => b.getPiece(pid!))
      .filter(p => p.side === ctx.piece!.side)
      .map(p => p.id);
  });

  reg.registerProvider("provider.piecesInRadius", (ctx, center: Tile, radius = 1) => {
    if (!center) return [];
    const b = ctx.engine.board;
    return b.neighbors(center, radius)
      .map(t => b.getPieceAt(t))
      .filter(pid => pid !== null);
  });

  reg.registerProvider("provider.enemiesInLineOfSight", (ctx, ...args: unknown[]) => {
    const maxRange = typeof args[0] === 'number' ? args[0] : 8;
    if (!ctx.piece) return [];
    const b = ctx.engine.board;
    const startTile = ctx.piece.tile;
    const startPos = tileToPosition(startTile);
    const enemies: string[] = [];

    // Directions : orthogonales + diagonales
    const directions = [
      [0, 1], [0, -1], [1, 0], [-1, 0],  // ortho
      [1, 1], [1, -1], [-1, 1], [-1, -1] // diag
    ];

    directions.forEach(([dr, dc]) => {
      for (let dist = 1; dist <= maxRange; dist++) {
        const newPos = {
          row: startPos.row + dr * dist,
          col: startPos.col + dc * dist
        };
        
        if (newPos.row < 0 || newPos.row >= 8 || newPos.col < 0 || newPos.col >= 8) {
          break; // Hors plateau
        }
        
        const tile = positionToTile(newPos);
        const pid = b.getPieceAt(tile);
        
        if (pid) {
          const piece = b.getPiece(pid);
          if (piece.side !== ctx.piece.side) {
            enemies.push(pid);
          }
          break; // Bloqué par une pièce
        }
      }
    });

    return enemies;
  });
}

// Helper functions for line of sight calculations
function tileToPosition(tile: string) {
  const file = tile.charCodeAt(0) - 97; // a=0, b=1, etc.
  const rank = 8 - parseInt(tile[1]); // 8=0, 7=1, etc.
  return { row: rank, col: file };
}

function positionToTile(pos: { row: number; col: number }): string {
  const file = String.fromCharCode(97 + pos.col);
  const rank = (8 - pos.row).toString();
  return `${file}${rank}`;
}
