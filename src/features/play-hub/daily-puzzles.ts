export interface PuzzleSquare {
  square: string;
  piece: string | null;
  pieceLabel: string | null;
  isLight: boolean;
}

const pieceGlyphs: Record<string, { glyph: string; label: string }> = {
  K: { glyph: "♔", label: "Roi blanc" },
  Q: { glyph: "♕", label: "Dame blanche" },
  R: { glyph: "♖", label: "Tour blanche" },
  B: { glyph: "♗", label: "Fou blanc" },
  N: { glyph: "♘", label: "Cavalier blanc" },
  P: { glyph: "♙", label: "Pion blanc" },
  k: { glyph: "♚", label: "Roi noir" },
  q: { glyph: "♛", label: "Dame noire" },
  r: { glyph: "♜", label: "Tour noire" },
  b: { glyph: "♝", label: "Fou noir" },
  n: { glyph: "♞", label: "Cavalier noir" },
  p: { glyph: "♟", label: "Pion noir" },
};

export function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function chessBoardFromFen(
  fen: string,
  perspective: "white" | "black" = "white",
): PuzzleSquare[] {
  const boardPart = fen.trim().split(/\s+/)[0] ?? "";
  const ranks = boardPart.split("/");

  if (ranks.length !== 8) {
    throw new Error("FEN invalide : huit rangées sont requises.");
  }
  const board = ranks.flatMap((rank, rankIndex) => {
    const expanded: Array<string | null> = [];
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) {
        expanded.push(
          ...Array.from<null>({ length: Number(token) }).fill(null),
        );
      } else if (pieceGlyphs[token]) {
        expanded.push(token);
      } else {
        throw new Error("FEN invalide : symbole de pièce inconnu.");
      }
    }

    if (expanded.length !== 8) {
      throw new Error("FEN invalide : chaque rangée doit contenir huit cases.");
    }

    return expanded.map((pieceCode, fileIndex) => {
      const file = String.fromCharCode(97 + fileIndex);
      const rankNumber = 8 - rankIndex;
      const piece = pieceCode ? pieceGlyphs[pieceCode] : null;
      return {
        square: `${file}${rankNumber}`,
        piece: piece?.glyph ?? null,
        pieceLabel: piece?.label ?? null,
        isLight: (rankIndex + fileIndex) % 2 === 0,
      };
    });
  });

  if (
    [...boardPart].filter((token) => token === "K").length !== 1 ||
    [...boardPart].filter((token) => token === "k").length !== 1
  ) {
    throw new Error("FEN invalide : un roi de chaque couleur est requis.");
  }

  return perspective === "white" ? board : [...board].reverse();
}

export function sideToMoveFromFen(fen: string): "white" | "black" {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) {
    throw new Error("FEN invalide : six champs sont requis.");
  }
  const [, side, castling, enPassant, halfMove, fullMove] = fields;
  if (!/^(?:-|(?=[KQkq])K?Q?k?q?)$/.test(castling)) {
    throw new Error("FEN invalide : droits de roque incorrects.");
  }
  if (!/^(?:-|[a-h][36])$/.test(enPassant)) {
    throw new Error("FEN invalide : case de prise en passant incorrecte.");
  }
  if (!/^\d+$/.test(halfMove) || !/^[1-9]\d*$/.test(fullMove)) {
    throw new Error("FEN invalide : compteurs de coups incorrects.");
  }
  if (side === "w") return "white";
  if (side === "b") return "black";
  throw new Error("FEN invalide : côté au trait absent.");
}

const SQUARE_PATTERN = /^[a-h][1-8]$/;

export function puzzleUciFromSquares(
  fen: string,
  from: string,
  to: string,
): string | null {
  const normalizedFrom = from.toLowerCase();
  const normalizedTo = to.toLowerCase();
  if (
    !SQUARE_PATTERN.test(normalizedFrom) ||
    !SQUARE_PATTERN.test(normalizedTo) ||
    normalizedFrom === normalizedTo
  ) {
    return null;
  }

  const sideToMove = sideToMoveFromFen(fen);
  const squares = chessBoardFromFen(fen);
  const source = squares.find((square) => square.square === normalizedFrom);
  const target = squares.find((square) => square.square === normalizedTo);
  const colorMarker = sideToMove === "white" ? "blanc" : "noir";
  const ownsSource =
    source?.pieceLabel?.toLowerCase().includes(colorMarker) ?? false;
  const ownsTarget =
    target?.pieceLabel?.toLowerCase().includes(colorMarker) ?? false;
  if (!source?.piece || !ownsSource || ownsTarget) return null;

  const promotesToQueen =
    (source.piece === "♙" && normalizedTo.endsWith("8")) ||
    (source.piece === "♟" && normalizedTo.endsWith("1"));
  return `${normalizedFrom}${normalizedTo}${promotesToQueen ? "q" : ""}`;
}
