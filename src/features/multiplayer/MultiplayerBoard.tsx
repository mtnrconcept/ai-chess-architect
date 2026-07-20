import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { MatchMove, MatchSide } from "./contracts";
import {
  buildMoveUci,
  parseFenBoard,
  squaresForPerspective,
  type BoardSquare,
} from "./fen";

interface MultiplayerBoardProps {
  fen: string;
  perspective: MatchSide;
  disabled: boolean;
  lastMove: MatchMove | null;
  onMoveIntent: (uci: string) => void;
}

const PIECE_LABELS = {
  king: "roi",
  queen: "dame",
  rook: "tour",
  bishop: "fou",
  knight: "cavalier",
  pawn: "pion",
} as const;

export function MultiplayerBoard({
  fen,
  perspective,
  disabled,
  lastMove,
  onMoveIntent,
}: MultiplayerBoardProps) {
  const [selected, setSelected] = useState<BoardSquare | null>(null);
  const parsed = useMemo(() => {
    try {
      return { board: parseFenBoard(fen), error: null };
    } catch (error) {
      return {
        board: null,
        error:
          error instanceof Error
            ? error.message
            : "La position serveur est invalide.",
      };
    }
  }, [fen]);
  const squares = useMemo(
    () => squaresForPerspective(perspective),
    [perspective],
  );

  useEffect(() => {
    setSelected(null);
  }, [disabled, fen]);

  if (!parsed.board) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-2xl border border-red-400/40 bg-red-950/30 p-8 text-center text-sm text-red-100"
        role="alert"
      >
        {parsed.error} Aucun coup ne peut être envoyé.
      </div>
    );
  }

  const handleSquare = (square: BoardSquare): void => {
    if (disabled) return;
    const piece = parsed.board?.[square];

    if (selected === null) {
      if (piece?.color === perspective) setSelected(square);
      return;
    }

    if (selected === square) {
      setSelected(null);
      return;
    }

    if (piece?.color === perspective) {
      setSelected(square);
      return;
    }

    const selectedPiece = parsed.board[selected];
    if (!selectedPiece || selectedPiece.color !== perspective) {
      setSelected(null);
      return;
    }

    onMoveIntent(buildMoveUci(selected, square, selectedPiece));
    setSelected(null);
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[680px] rounded-2xl border border-cyan-300/25 bg-slate-950/80 p-2 shadow-[0_20px_80px_-35px_rgba(34,211,238,0.8)] sm:p-3">
      <div
        className="grid h-full w-full grid-cols-8 overflow-hidden rounded-xl border border-white/10"
        aria-label={`Échiquier, perspective ${perspective === "white" ? "blanche" : "noire"}`}
        role="group"
      >
        {squares.map((square, index) => {
          const piece = parsed.board?.[square];
          const isLight =
            (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;
          const isSelected = selected === square;
          const isLastMove =
            lastMove?.from === square || lastMove?.to === square;
          const canSelect = !disabled && piece?.color === perspective;
          const row = Math.floor(index / 8);
          const column = index % 8;
          const pieceLabel = piece
            ? `${PIECE_LABELS[piece.kind]} ${piece.color === "white" ? "blanc" : "noir"}`
            : "case vide";

          return (
            <button
              key={square}
              type="button"
              className={cn(
                "group relative flex aspect-square min-h-0 items-center justify-center transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-inset",
                isLight ? "bg-cyan-100/85" : "bg-slate-700/95",
                isLastMove && "bg-fuchsia-400/55",
                isSelected &&
                  "z-[1] bg-cyan-400/70 ring-4 ring-inset ring-cyan-100",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                canSelect && "hover:bg-cyan-300/70",
              )}
              onClick={() => handleSquare(square)}
              disabled={disabled}
              aria-label={`${square}, ${pieceLabel}${isSelected ? ", sélectionnée" : ""}`}
              aria-pressed={isSelected}
              data-square={square}
            >
              {column === 0 && (
                <span className="pointer-events-none absolute left-1 top-0.5 text-[9px] font-bold text-slate-950/65 sm:text-[11px]">
                  {square[1]}
                </span>
              )}
              {row === 7 && (
                <span className="pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-bold text-slate-950/65 sm:text-[11px]">
                  {square[0]}
                </span>
              )}
              {piece && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "select-none font-serif text-[clamp(1.6rem,8vw,4.5rem)] leading-none drop-shadow-[0_2px_1px_rgba(0,0,0,0.55)] transition-transform group-hover:scale-105",
                    piece.color === "white"
                      ? "text-white [text-shadow:0_0_2px_#020617,0_1px_2px_#020617]"
                      : "text-slate-950 [text-shadow:0_0_1px_#fff]",
                  )}
                >
                  {piece.symbol}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
