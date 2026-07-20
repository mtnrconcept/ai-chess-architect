import type { MatchMove, MatchSide } from "./contracts";

export const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const BOARD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const BOARD_RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

export type BoardFile = (typeof BOARD_FILES)[number];
export type BoardRank = (typeof BOARD_RANKS)[number];
export type BoardSquare = `${BoardFile}${BoardRank}`;
export type ServerPieceKind =
  | "king"
  | "queen"
  | "rook"
  | "bishop"
  | "knight"
  | "pawn";

export interface ServerPiece {
  color: MatchSide;
  kind: ServerPieceKind;
  symbol: string;
}

export type FenBoard = Readonly<Record<BoardSquare, ServerPiece | undefined>>;

const KIND_BY_FEN: Readonly<Record<string, ServerPieceKind>> = Object.freeze({
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
});

const SYMBOL_BY_PIECE: Readonly<
  Record<ServerPieceKind, Readonly<Record<MatchSide, string>>>
> = Object.freeze({
  king: Object.freeze({ white: "♔", black: "♚" }),
  queen: Object.freeze({ white: "♕", black: "♛" }),
  rook: Object.freeze({ white: "♖", black: "♜" }),
  bishop: Object.freeze({ white: "♗", black: "♝" }),
  knight: Object.freeze({ white: "♘", black: "♞" }),
  pawn: Object.freeze({ white: "♙", black: "♟" }),
});

const isBoardSquare = (value: string): value is BoardSquare =>
  /^[a-h][1-8]$/.test(value);

export const parseFenBoard = (fen: string): FenBoard => {
  if (typeof fen !== "string" || fen.length > 512) {
    throw new Error("FEN serveur invalide.");
  }

  const [placement] = fen.trim().split(/\s+/);
  const fenRanks = placement?.split("/") ?? [];
  if (fenRanks.length !== 8) {
    throw new Error("FEN serveur invalide: huit rangées sont requises.");
  }

  const board: Partial<Record<BoardSquare, ServerPiece>> = {};
  fenRanks.forEach((rank, rankIndex) => {
    let fileIndex = 0;
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) {
        fileIndex += Number(token);
        continue;
      }

      const kind = KIND_BY_FEN[token.toLowerCase()];
      if (!kind || fileIndex >= BOARD_FILES.length) {
        throw new Error("FEN serveur invalide: pièce ou colonne inconnue.");
      }

      const square = `${BOARD_FILES[fileIndex]}${8 - rankIndex}`;
      if (!isBoardSquare(square)) {
        throw new Error("FEN serveur invalide: case hors plateau.");
      }
      const color: MatchSide =
        token === token.toUpperCase() ? "white" : "black";
      board[square] = {
        color,
        kind,
        symbol: SYMBOL_BY_PIECE[kind][color],
      };
      fileIndex += 1;
    }

    if (fileIndex !== BOARD_FILES.length) {
      throw new Error("FEN serveur invalide: rangée incomplète.");
    }
  });

  return Object.freeze(board) as FenBoard;
};

export const squaresForPerspective = (
  perspective: MatchSide,
): readonly BoardSquare[] => {
  const files =
    perspective === "white" ? BOARD_FILES : [...BOARD_FILES].reverse();
  const ranks =
    perspective === "white" ? [...BOARD_RANKS].reverse() : BOARD_RANKS;

  return ranks.flatMap((rank) =>
    files.map((file) => `${file}${rank}` as BoardSquare),
  );
};

export const canonicalFenFromMoves = (moves: readonly MatchMove[]): string => {
  const latestFen = moves[moves.length - 1]?.fenAfter?.trim();
  return latestFen || STANDARD_START_FEN;
};

export const buildMoveUci = (
  from: BoardSquare,
  to: BoardSquare,
  piece: ServerPiece,
): string => {
  const reachesPromotionRank =
    piece.kind === "pawn" &&
    ((piece.color === "white" && to[1] === "8") ||
      (piece.color === "black" && to[1] === "1"));
  return `${from}${to}${reachesPromotionRank ? "q" : ""}`;
};
