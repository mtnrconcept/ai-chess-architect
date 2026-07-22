import type { PieceID, Tile } from "./types";
import type { ChessMove, ChessPiece, Position } from "@/types/chess";

type ChessPieceWithEngineId = ChessPiece & { __engineId?: PieceID };

export interface MoveCommittedPayload {
  pieceId: PieceID;
  from: Tile;
  to: Tile;
  targetPieceId?: PieceID;
}

const positionToTile = (position: Position): Tile =>
  `${String.fromCharCode(97 + position.col)}${8 - position.row}` as Tile;

/**
 * Adds the captured piece to the deterministic lifecycle context. The fallback
 * identifier is opaque and stable for the committed move; it is never used as a
 * database identifier.
 */
export function resolveCapturedTargetPieceId(
  lastMove: ChessMove | undefined,
  moveNumber: number,
  payload: MoveCommittedPayload,
): PieceID | undefined {
  if (
    !lastMove?.captured ||
    positionToTile(lastMove.from) !== payload.from ||
    positionToTile(lastMove.to) !== payload.to
  ) {
    return undefined;
  }

  const captured = lastMove.captured as ChessPieceWithEngineId;
  return (
    captured.__engineId ??
    (`captured_${Math.max(0, Math.floor(moveNumber))}_${payload.to}` as PieceID)
  );
}
