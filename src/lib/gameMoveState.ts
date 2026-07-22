import { ChessEngine } from "@/lib/chessEngine";
import type {
  ChessMove,
  ChessPiece,
  GameState,
  PieceColor,
  Position,
} from "@/types/chess";

export interface AppliedGameMove {
  state: GameState;
  move: ChessMove;
}

const samePosition = (left: Position, right: Position): boolean =>
  left.row === right.row && left.col === right.col;

export function canPlayFromState(state: GameState): boolean {
  return state.gameStatus === "active" || state.gameStatus === "check";
}

/**
 * Applies one fully validated chess move and computes the next canonical local
 * state. Both the human player and the deterministic AI use this exact path.
 */
export function applyMoveToGameState(
  previous: GameState,
  piece: ChessPiece,
  destination: Position,
  durationMs?: number,
): AppliedGameMove | null {
  if (!canPlayFromState(previous) || piece.color !== previous.currentPlayer) {
    return null;
  }

  const selectedPiece = ChessEngine.getPieceAt(previous.board, piece.position);
  if (!selectedPiece || selectedPiece.color !== previous.currentPlayer) {
    return null;
  }

  const stateForPiece: GameState = {
    ...previous,
    selectedPiece,
  };
  const legalMoves = ChessEngine.getValidMoves(
    previous.board,
    selectedPiece,
    stateForPiece,
  );
  if (!legalMoves.some((move) => samePosition(move, destination))) {
    return null;
  }

  const move = ChessEngine.createMove(
    previous.board,
    selectedPiece,
    destination,
    previous,
  );
  move.timestamp = new Date().toISOString();
  if (Number.isFinite(durationMs) && Number(durationMs) >= 0) {
    move.durationMs = Math.round(Number(durationMs));
  }

  const updatedBoard = ChessEngine.executeMove(previous.board, move, previous);
  const capturedPieces = move.captured
    ? [...previous.capturedPieces, move.captured]
    : previous.capturedPieces;
  const nextPlayer: PieceColor =
    previous.currentPlayer === "white" ? "black" : "white";
  const signature = ChessEngine.getBoardSignature(updatedBoard);
  const updatedHistory = {
    ...previous.positionHistory,
    [signature]: (previous.positionHistory[signature] ?? 0) + 1,
  };

  const baseState: GameState = {
    ...previous,
    board: updatedBoard,
    capturedPieces,
    moveHistory: [...previous.moveHistory, move],
    currentPlayer: nextPlayer,
    turnNumber:
      previous.currentPlayer === "black"
        ? previous.turnNumber + 1
        : previous.turnNumber,
    movesThisTurn: 0,
    selectedPiece: null,
    validMoves: [],
    lastMoveByColor: {
      ...previous.lastMoveByColor,
      [previous.currentPlayer]: move,
    },
    positionHistory: updatedHistory,
  };

  const stateForStatus: GameState = {
    ...baseState,
    selectedPiece: null,
    validMoves: [],
  };
  const inCheck = ChessEngine.isInCheck(
    updatedBoard,
    nextPlayer,
    stateForStatus,
  );
  const hasMoves = ChessEngine.hasAnyLegalMoves(
    updatedBoard,
    nextPlayer,
    stateForStatus,
  );

  let gameStatus: GameState["gameStatus"] = "active";
  if (inCheck && !hasMoves) gameStatus = "checkmate";
  else if (!inCheck && !hasMoves) gameStatus = "stalemate";
  else if (inCheck) gameStatus = "check";

  return {
    move,
    state: {
      ...baseState,
      gameStatus,
    },
  };
}
