import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  chessBoardFromFen,
  puzzleUciFromSquares,
  sideToMoveFromFen,
} from "./daily-puzzles";

interface PuzzleBoardProps {
  fen: string;
  perspective: "white" | "black";
  disabled?: boolean;
  selectedMove?: string | null;
  onMoveSelected?: (uci: string) => void;
}

export function PuzzleBoard({
  fen,
  perspective,
  disabled = false,
  selectedMove = null,
  onMoveSelected,
}: PuzzleBoardProps) {
  const [fromSquare, setFromSquare] = useState<string | null>(null);
  const position = useMemo(() => {
    try {
      const sideToMove = sideToMoveFromFen(fen);
      return {
        board: chessBoardFromFen(fen, perspective),
        sideToMove,
      };
    } catch {
      return null;
    }
  }, [fen, perspective]);
  const boardRows = useMemo(
    () =>
      position
        ? Array.from({ length: 8 }, (_, row) =>
            position.board.slice(row * 8, row * 8 + 8),
          )
        : [],
    [position],
  );
  const submittedSquares = useMemo(
    () =>
      selectedMove && /^[a-h][1-8][a-h][1-8]q?$/.test(selectedMove)
        ? new Set([selectedMove.slice(0, 2), selectedMove.slice(2, 4)])
        : new Set<string>(),
    [selectedMove],
  );

  if (!position) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Position invalide</AlertTitle>
        <AlertDescription>
          L’échiquier ne peut pas afficher la position reçue du serveur. Aucun
          coup ne peut être soumis.
        </AlertDescription>
      </Alert>
    );
  }

  const selectSquare = (square: string, pieceLabel: string | null) => {
    if (disabled || !onMoveSelected) return;
    const ownsPiece = pieceLabel
      ?.toLowerCase()
      .includes(position.sideToMove === "white" ? "blanc" : "noir");

    if (!fromSquare) {
      if (ownsPiece) setFromSquare(square);
      return;
    }
    if (square === fromSquare) {
      setFromSquare(null);
      return;
    }

    const uci = puzzleUciFromSquares(fen, fromSquare, square);
    if (uci) {
      setFromSquare(null);
      onMoveSelected(uci);
      return;
    }
    setFromSquare(ownsPiece ? square : null);
  };

  return (
    <div
      className="mx-auto grid aspect-square w-full max-w-[340px] grid-cols-8 overflow-hidden rounded-xl border border-white/15 shadow-[0_18px_55px_-25px_rgba(251,191,36,0.55)]"
      role="grid"
      aria-label={`Échiquier du puzzle, perspective ${perspective === "white" ? "blanche" : "noire"}`}
    >
      {boardRows.map((row) => (
        <div key={row[0].square} role="row" className="contents">
          {row.map((square) => {
            const selectedFrom = fromSquare === square.square;
            const belongsToSubmittedMove = submittedSquares.has(square.square);
            const squareClassName = cn(
              "relative grid aspect-square place-items-center text-[clamp(1.15rem,6vw,2rem)] leading-none",
              square.isLight ? "bg-cyan-100/80" : "bg-indigo-950",
              square.pieceLabel?.includes("blanc")
                ? "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
                : "text-slate-950 [text-shadow:0_1px_1px_rgba(255,255,255,0.35)]",
              selectedFrom &&
                "z-10 ring-4 ring-inset ring-amber-300 [box-shadow:inset_0_0_18px_rgba(251,191,36,0.35)]",
              belongsToSubmittedMove &&
                !selectedFrom &&
                "ring-4 ring-inset ring-cyan-300/80",
            );

            return onMoveSelected ? (
              <button
                key={square.square}
                type="button"
                role="gridcell"
                aria-label={`${square.square}, ${square.pieceLabel ?? "case vide"}${selectedFrom ? ", départ sélectionné" : ""}`}
                aria-pressed={selectedFrom}
                disabled={disabled}
                onClick={() => selectSquare(square.square, square.pieceLabel)}
                className={cn(
                  squareClassName,
                  "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-amber-300 disabled:cursor-default",
                )}
              >
                <span aria-hidden="true">{square.piece}</span>
              </button>
            ) : (
              <div
                key={square.square}
                role="gridcell"
                aria-label={`${square.square}, ${square.pieceLabel ?? "case vide"}`}
                className={squareClassName}
              >
                <span aria-hidden="true">{square.piece}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
