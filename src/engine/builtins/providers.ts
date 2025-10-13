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
}
