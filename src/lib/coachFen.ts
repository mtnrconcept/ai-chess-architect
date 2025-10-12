import type { SerializedBoardState } from '@/lib/postGameAnalysis';
import type { PieceColor, PieceType } from '@/types/chess';

const PIECE_SYMBOLS: Record<PieceColor, Record<PieceType, string>> = {
  white: {
    king: 'K',
    queen: 'Q',
    rook: 'R',
    bishop: 'B',
    knight: 'N',
    pawn: 'P',
  },
  black: {
    king: 'k',
    queen: 'q',
    rook: 'r',
    bishop: 'b',
    knight: 'n',
    pawn: 'p',
  },
};

const EMPTY_BOARD = () => Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));

const serializeRow = (row: Array<string | null>) => {
  let result = '';
  let empty = 0;

  for (const cell of row) {
    if (!cell) {
      empty += 1;
    } else {
      if (empty > 0) {
        result += String(empty);
        empty = 0;
      }
      result += cell;
    }
  }

  if (empty > 0) {
    result += String(empty);
  }

  return result || '8';
};

export const boardStateToFen = (
  snapshot: SerializedBoardState,
  sideToMove: PieceColor,
  fullmoveNumber: number,
) => {
  const board = EMPTY_BOARD();

  snapshot.pieces.forEach(piece => {
    const symbol = PIECE_SYMBOLS[piece.color][piece.type];
    board[piece.row][piece.col] = symbol;
  });

  const ranks = board.map(row => serializeRow(row));
  const boardEncoding = ranks.join('/');
  const castling = '-';
  const enPassant = '-';
  const halfmoveClock = '0';
  const fullmove = Math.max(1, fullmoveNumber);

  return `${boardEncoding} ${sideToMove === 'white' ? 'w' : 'b'} ${castling} ${enPassant} ${halfmoveClock} ${fullmove}`;
};
