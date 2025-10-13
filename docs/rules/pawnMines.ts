// rules/pawnMines.ts
import { Engine, Tile, PieceID, Side } from "@/engine/types";

export const NS = "rules.pawnMines";

type Mine = {
  id: string;
  tile: Tile;
  owner: Side;
  armed: boolean;
  visibleTo: "all" | "owner" | "none";
  stackIndex: number;
  ttl: number | null;
  createdAtPly: number;
};

export function getState(engine: Engine) {
  return engine.state.getOrInit(NS, { mines: [] as Mine[] });
}

export function getValidTiles(engine: Engine, pieceId: PieceID): Tile[] {
  const { parameters } = engine.rules.get(NS);
  // Exemple simple : toute case vide
  return engine.board.tiles().filter(t => engine.board.isEmpty(t));
}

export function handlePlaceMineAction(engine: Engine, pieceId: PieceID, target: Tile) {
  const st = getState(engine);
  const params = engine.rules.get(NS).parameters;
  // Guards
  if (!engine.cooldown.isReady(pieceId, "special_place_mine")) return engine.ui.toast("Action en recharge");
  if (!engine.board.isEmpty(target)) return engine.ui.toast("Case non libre");

  const mine: Mine = {
    id: engine.util.uuid(),
    tile: target,
    owner: engine.pieces.get(pieceId).side,
    armed: (params.armDelayPly ?? 0) === 0,
    visibleTo: params.visibility ?? "all",
    stackIndex: 0,
    ttl: null,
    createdAtPly: engine.match.getPly()
  };

  st.mines.push(mine);
  engine.vfx.spawnDecal("mine_idle", target);
  engine.audio.play("place");
  engine.cooldown.set(pieceId, "special_place_mine", 1);
  engine.turn.end();
}

export function handleMoveCommitted(engine: Engine) {
  const st = getState(engine);
  const params = engine.rules.get(NS).parameters;
  if ((params.armDelayPly ?? 0) > 0) {
    st.mines.forEach(m => {
      if (!m.armed && engine.match.getPly() - m.createdAtPly >= (params.armDelayPly as number)) {
        m.armed = true;
        engine.audio.play("arm");
      }
    });
  }
}

export function tileHasArmedMine(engine: Engine, tile: Tile): Mine | null {
  const st = getState(engine);
  return st.mines.find(m => m.tile === tile && m.armed) ?? null;
}

export function handleEnterTile(engine: Engine, pieceId: PieceID, to: Tile) {
  const mine = tileHasArmedMine(engine, to);
  if (!mine) return;
  resolveExplosion(engine, mine, pieceId);
}

export function resolveExplosion(engine: Engine, mine: Mine, victimId?: PieceID) {
  const params = engine.rules.get(NS).parameters;
  engine.animation.play("explosion", mine.tile);
  engine.audio.play("boom");

  // Capture dans le rayon (0 = la case)
  const impactedTiles = [mine.tile];
  impactedTiles.forEach(t => {
    const pid = engine.board.getPieceAt(t);
    if (!pid) return;
    const isAlly = engine.pieces.get(pid).side === mine.owner;
    if (!isAlly || params.friendlyFire) {
      engine.capturePiece(pid, "mine_explosion");
    }
  });

  // Nettoyage
  const st = getState(engine);
  st.mines = st.mines.filter(m => m.id !== mine.id);
  engine.board.clearDecal(mine.tile);
}
