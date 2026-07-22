import { ChessEngine } from "@/lib/chessEngine";
import { applyMoveToGameState } from "@/lib/gameMoveState";
import type {
  ChessPiece,
  GameState,
  PieceColor,
  Position,
} from "@/types/chess";

export interface AiMoveChoice {
  piece: ChessPiece;
  to: Position;
  score: number;
}

interface SearchBudget {
  visited: number;
  max: number;
}

const PIECE_VALUE: Record<ChessPiece["type"], number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20_000,
};

const samePosition = (left: Position, right: Position): boolean =>
  left.row === right.row && left.col === right.col;

const enumerateLegalMoves = (state: GameState): AiMoveChoice[] => {
  const result: AiMoveChoice[] = [];
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece || piece.color !== state.currentPlayer) continue;
      const moves = ChessEngine.getValidMoves(state.board, piece, {
        ...state,
        selectedPiece: piece,
      });
      for (const to of moves) {
        const captured = ChessEngine.getPieceAt(state.board, to);
        const centerDistance = Math.abs(3.5 - to.row) + Math.abs(3.5 - to.col);
        const orderingScore =
          (captured ? PIECE_VALUE[captured.type] * 10 : 0) - centerDistance;
        result.push({ piece, to, score: orderingScore });
      }
    }
  }
  return result.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftKey = `${left.piece.position.row}${left.piece.position.col}${left.to.row}${left.to.col}`;
    const rightKey = `${right.piece.position.row}${right.piece.position.col}${right.to.row}${right.to.col}`;
    return leftKey.localeCompare(rightKey);
  });
};

const evaluatePosition = (state: GameState, perspective: PieceColor): number => {
  if (state.gameStatus === "checkmate") {
    return state.currentPlayer === perspective ? -1_000_000 : 1_000_000;
  }
  if (state.gameStatus === "stalemate") return 0;

  let score = 0;
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece) continue;
      const direction = piece.color === perspective ? 1 : -1;
      const centerBonus = Math.round(
        12 - (Math.abs(3.5 - piece.position.row) + Math.abs(3.5 - piece.position.col)) * 2,
      );
      score += direction * (PIECE_VALUE[piece.type] + centerBonus);
    }
  }

  const currentMoves = enumerateLegalMoves(state).length;
  score += (state.currentPlayer === perspective ? 1 : -1) * currentMoves * 2;
  if (state.gameStatus === "check") {
    score += state.currentPlayer === perspective ? -45 : 45;
  }
  return score;
};

const minimax = (
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  perspective: PieceColor,
  budget: SearchBudget,
): number => {
  budget.visited += 1;
  if (
    depth <= 0 ||
    budget.visited >= budget.max ||
    state.gameStatus === "checkmate" ||
    state.gameStatus === "stalemate"
  ) {
    return evaluatePosition(state, perspective);
  }

  const candidates = enumerateLegalMoves(state);
  if (candidates.length === 0) return evaluatePosition(state, perspective);
  const maximizing = state.currentPlayer === perspective;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const applied = applyMoveToGameState(state, candidate.piece, candidate.to);
    if (!applied) continue;
    const value = minimax(
      applied.state,
      depth - 1,
      alpha,
      beta,
      perspective,
      budget,
    );
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha || budget.visited >= budget.max) break;
  }

  return Number.isFinite(best) ? best : evaluatePosition(state, perspective);
};

const deterministicSelectionIndex = (state: GameState, length: number): number => {
  if (length <= 1) return 0;
  const text = `${ChessEngine.getBoardSignature(state.board)}|${state.turnNumber}|${state.moveHistory.length}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
};

/**
 * Deterministic, bounded alpha-beta opponent. It never invents a move: every
 * candidate comes from ChessEngine.getValidMoves and is revalidated by the same
 * transition used for human moves.
 */
export function chooseAiMove(
  state: GameState,
  requestedDepth: number,
  selectionRange = 1,
): AiMoveChoice | null {
  if (state.gameStatus !== "active" && state.gameStatus !== "check") return null;
  const perspective = state.currentPlayer;
  const depth = Math.max(1, Math.min(3, Math.floor(requestedDepth)));
  const candidates = enumerateLegalMoves(state);
  if (candidates.length === 0) return null;
  const budget: SearchBudget = {
    visited: 0,
    max: depth === 1 ? 1_200 : depth === 2 ? 4_000 : 8_000,
  };

  const scored = candidates.map((candidate) => {
    const applied = applyMoveToGameState(state, candidate.piece, candidate.to);
    if (!applied) return { ...candidate, score: Number.NEGATIVE_INFINITY };
    return {
      ...candidate,
      score: minimax(
        applied.state,
        depth - 1,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        perspective,
        budget,
      ),
    };
  });
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (!samePosition(left.piece.position, right.piece.position)) {
      return (
        left.piece.position.row - right.piece.position.row ||
        left.piece.position.col - right.piece.position.col
      );
    }
    return left.to.row - right.to.row || left.to.col - right.to.col;
  });

  const range = Math.max(1, Math.min(scored.length, Math.floor(selectionRange)));
  return scored[deterministicSelectionIndex(state, range)] ?? scored[0] ?? null;
}
