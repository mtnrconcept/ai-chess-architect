import type { StoredGameRecord, StoredAnalyzedMove } from '@/lib/gameStorage';
import { boardStateToFen } from '@/lib/coachFen';
import type { PieceColor, Position } from '@/types/chess';

export type CoachMovePayload = {
  san: string;
  uci: string;
  fen_before: string;
  fen_after: string;
  time_ms?: number | null;
};

const toAlgebraic = (position: Position) => {
  const file = String.fromCharCode(97 + position.col);
  const rank = 8 - position.row;
  return `${file}${rank}`;
};

const detectPromotion = (move: StoredAnalyzedMove) => {
  const notation = move.notation ?? '';
  const match = notation.match(/=([QRBN])/i);
  if (!match) return '';
  return match[1].toLowerCase();
};

const fullmoveBefore = (plyIndex: number) => Math.floor(plyIndex / 2) + 1;
const fullmoveAfter = (plyIndex: number) => Math.floor((plyIndex + 1) / 2) + 1;

const nextPlayer = (color: PieceColor): PieceColor => (color === 'white' ? 'black' : 'white');

export const buildCoachMoves = (game: StoredGameRecord): CoachMovePayload[] => {
  if (!game) return [];

  const moves: CoachMovePayload[] = [];
  let previousSnapshot = game.starting_board;

  game.move_history.forEach((move, index) => {
    const beforeSnapshot = index === 0 ? game.starting_board : game.move_history[index - 1]?.boardSnapshot ?? previousSnapshot;
    const afterSnapshot = move.boardSnapshot ?? previousSnapshot;
    const actor = move.color;

    const fenBefore = boardStateToFen(beforeSnapshot, actor, fullmoveBefore(index));
    const fenAfter = boardStateToFen(afterSnapshot, nextPlayer(actor), fullmoveAfter(index));

    const from = toAlgebraic(move.from);
    const to = toAlgebraic(move.to);
    const promotion = detectPromotion(move);
    const uci = `${from}${to}${promotion}`;

    moves.push({
      san: move.notation,
      uci,
      fen_before: fenBefore,
      fen_after: fenAfter,
      time_ms: move.durationMs ?? null,
    });

    previousSnapshot = afterSnapshot;
  });

  return moves;
};
