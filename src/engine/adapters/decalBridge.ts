import type { ChessBoardAdapter } from "./chessBoardAdapter";
import type { VFXAdapter } from "./vfxAdapter";

/**
 * The board's deterministic decal state is authoritative. The VFX adapter
 * only mirrors it; the gameplay engine never waits for rendering.
 */
export function connectBoardDecalFx(
  board: ChessBoardAdapter,
  vfx: VFXAdapter,
): () => void {
  board.setDecalChangeListener((tile, sprite) => {
    if (sprite === null) vfx.clearDecal(tile);
    else vfx.spawnDecal(sprite, tile);
  });
  for (const tile of board.tiles()) {
    const sprite = board.getDecal(tile);
    if (sprite !== null) vfx.spawnDecal(sprite, tile);
  }
  return () => board.setDecalChangeListener(undefined);
}
