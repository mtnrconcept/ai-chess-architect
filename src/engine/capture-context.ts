import type { EngineEventMap } from "./types";
import type { ChessMove, ChessPiece, Position } from "@/types/chess";

type ChessPieceWithEngineId = ChessPiece & { __engineId?: string };

const positionToTile = (position: Position): string =>
  `${String.fromCharCode(97 + position.col)}${8 - position.row}`;

export const resolveCapturedTargetPieceId = (
  lastMove: ChessMove | undefined,
  moveNumber: number,
  payload: EngineEventMap["lifecycle.onMoveCommitted"],
): string | undefined => {
  if (
    !lastMove?.captured ||
    positionToTile(lastMove.from) !== payload.from ||
    positionToTile(lastMove.to) !== payload.to
  ) {
    return undefined;
  }

  const captured = lastMove.captured as ChessPieceWithEngineId;
  return captured.__engineId ?? `captured_${moveNumber}_${payload.to}`;
};
