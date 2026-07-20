import { useCallback, useRef, type CSSProperties } from "react";
import { FxProvider, FxRuntimeEventBridge } from "@/fx/context";
import { cn } from "@/lib/utils";
import type {
  ChessMove,
  ChessPiece,
  PieceColor,
  Position,
  SpecialAttackInstance,
  VisualEffect,
} from "@/types/chess";

type MaybeMove =
  | Position
  | { to: Position }
  | { row: number; col: number }
  | { to: { row: number; col: number } };

const getMovePos = (move: MaybeMove): Position => {
  // Support Position or { to: Position } for historical callers.
  // @ts-expect-error — intentionally permissive at this compatibility boundary.
  return move?.to ? (move as { to: Position }).to : (move as Position);
};

const samePos = (
  left: Position | null | undefined,
  right: Position | null | undefined,
) =>
  Boolean(
    left && right && left.row === right.row && left.col === right.col,
  );

const sanitizeToken = (value: string | undefined | null): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

const positionToTile = (row: number, col: number): string =>
  `${"abcdefgh"[col] ?? "a"}${8 - row}`;

/** Accepts VisualEffect.{name|animation} and its optional type. */
const resolveEffectClassNames = (effect: VisualEffect) => {
  const record = effect as VisualEffect & { name?: string };
  const typeToken = sanitizeToken(record.type);
  const animToken = sanitizeToken(record.animation || record.name);
  const base =
    typeToken === "projection"
      ? "special-hologram"
      : typeToken === "phantom"
        ? "special-phantom"
        : "special-explosion";
  const animation = animToken ? `${base}-${animToken}` : "";
  const multiplier =
    base === "special-hologram"
      ? 0.22
      : base === "special-phantom"
        ? 0.18
        : 0.3;
  return { base, animation, multiplier } as const;
};

interface ChessBoardProps {
  board: (ChessPiece | null)[][];
  selected: Position | null;
  validMoves: MaybeMove[];
  visualEffects?: VisualEffect[];
  specialAttacks?: SpecialAttackInstance[];
  onSquareClick: (position: Position) => void;
  lastMove?: ChessMove | null;
  currentPlayer?: PieceColor;
  readOnly?: boolean;
  highlightSquares?: Position[];
}

const pieceSymbols: Record<
  ChessPiece["type"],
  { white: string; black: string }
> = {
  king: { white: "♔", black: "♚" },
  queen: { white: "♕", black: "♛" },
  rook: { white: "♖", black: "♜" },
  bishop: { white: "♗", black: "♝" },
  knight: { white: "♘", black: "♞" },
  pawn: { white: "♙", black: "♟" },
};

const pieceGradients: Record<ChessPiece["color"], string> = {
  white: "from-cyan-200 via-sky-400 to-fuchsia-400",
  black: "from-amber-200 via-rose-400 to-purple-500",
};

const ChessBoard = ({
  board,
  selected,
  validMoves,
  visualEffects = [],
  specialAttacks = [],
  onSquareClick,
  lastMove,
  currentPlayer: _currentPlayer,
  readOnly = false,
  highlightSquares = [],
}: ChessBoardProps) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const safeBoard =
    board || Array.from({ length: 8 }, () => Array(8).fill(null));

  const toCellPos = useCallback((cell: string) => {
    if (!/^[a-h][1-8]$/.test(cell)) return { x: 0, y: 0 };
    const boardElement = boardRef.current;
    const cellElement = boardElement?.querySelector<HTMLElement>(
      `[data-chess-cell="${cell}"]`,
    );
    if (!boardElement || !cellElement) return { x: 0, y: 0 };

    const boardRect = boardElement.getBoundingClientRect();
    const cellRect = cellElement.getBoundingClientRect();
    return {
      x: cellRect.left - boardRect.left + cellRect.width / 2,
      y: cellRect.top - boardRect.top + cellRect.height / 2,
    };
  }, []);

  const isValidMove = (row: number, col: number) =>
    (validMoves ?? []).some((move) =>
      samePos(getMovePos(move), { row, col }),
    );

  const isSelected = (row: number, col: number) =>
    samePos(selected, { row, col });

  const isHighlighted = (row: number, col: number) =>
    (highlightSquares ?? []).some((position) =>
      samePos(position, { row, col }),
    );

  const isLastMove = (row: number, col: number) =>
    lastMove
      ? samePos(lastMove.to, { row, col }) ||
        samePos(lastMove.from, { row, col })
      : false;

  return (
    <div className="relative flex w-full justify-center">
      <div
        ref={boardRef}
        className="relative mx-auto aspect-square w-full max-w-[min(92vw,520px)] sm:max-w-[min(85vw,560px)] lg:max-w-[520px]"
      >
        <FxProvider boardRef={boardRef} toCellPos={toCellPos}>
          <FxRuntimeEventBridge />
          <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[conic-gradient(at_top,_rgba(34,211,238,0.55),rgba(236,72,153,0.4),rgba(129,140,248,0.45),rgba(34,211,238,0.55))] opacity-70 blur-3xl animate-neonPulse" />
          <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_60px_-25px_rgba(236,72,153,0.55)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-fuchsia-500/10" />
            <div className="pointer-events-none absolute inset-0 -translate-x-full bg-white/10 mix-blend-screen animate-neonShimmer" />
            <div className="relative grid h-full w-full grid-cols-8 gap-[2px] p-3 sm:p-4">
              {safeBoard.map((row, rowIndex) =>
                row.map((piece, colIndex) => {
                  const isLight = (rowIndex + colIndex) % 2 === 0;
                  const selectedSquare = isSelected(rowIndex, colIndex);
                  const validSquare = isValidMove(rowIndex, colIndex);
                  const highlighted = isHighlighted(rowIndex, colIndex);
                  const inLastMove = isLastMove(rowIndex, colIndex);
                  const tile = positionToTile(rowIndex, colIndex);

                  const handleClick = () => {
                    if (readOnly) return;
                    onSquareClick({ row: rowIndex, col: colIndex });
                  };

                  const attacksHere = specialAttacks.filter(
                    (attack) =>
                      attack.position.row === rowIndex &&
                      attack.position.col === colIndex,
                  );

                  const effectsHere = visualEffects.filter(
                    (effect) =>
                      effect.position.row === rowIndex &&
                      effect.position.col === colIndex,
                  );

                  return (
                    <button
                      type="button"
                      key={`${rowIndex}-${colIndex}`}
                      data-chess-cell={tile}
                      onClick={readOnly ? undefined : handleClick}
                      aria-disabled={readOnly}
                      className={cn(
                        "group relative flex aspect-square items-center justify-center overflow-hidden rounded-[0.95rem] border border-white/5 transition-all duration-300 ease-out",
                        isLight
                          ? "bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.45),rgba(2,6,23,0.92))]"
                          : "bg-[radial-gradient(circle_at_70%_70%,rgba(236,72,153,0.55),rgba(2,6,23,0.92))]",
                        selectedSquare
                          ? "ring-2 ring-cyan-300/90 shadow-[0_0_28px_rgba(56,189,248,0.75)]"
                          : highlighted
                            ? "ring-2 ring-amber-300/80 shadow-[0_0_26px_rgba(251,191,36,0.55)]"
                            : inLastMove
                              ? "ring-2 ring-fuchsia-300/70"
                              : "hover:-translate-y-[1px] hover:shadow-[0_0_22px_rgba(168,85,247,0.45)]",
                        readOnly && "cursor-default",
                      )}
                    >
                      {validSquare && (
                        <span className="pointer-events-none absolute inset-0 rounded-[0.95rem] border border-cyan-300/50 animate-neonPulse" />
                      )}

                      {validSquare && !piece && (
                        <>
                          <span className="pointer-events-none absolute h-5 w-5 rounded-full bg-cyan-300/70 blur-[1px]" />
                          <span className="pointer-events-none absolute h-5 w-5 rounded-full border border-cyan-300/80 animate-ripple" />
                        </>
                      )}

                      {attacksHere.map((attack) => {
                        const scale =
                          1 + Math.max(0, (attack.radius ?? 1) - 1) * 0.25;
                        const style: CSSProperties = {
                          transform: `scale(${scale})`,
                        };
                        const animToken = sanitizeToken(attack.animation);
                        const baseMarkerClass = "special-attack-marker";
                        const kindClass =
                          attack.ability === "deployMine"
                            ? "special-attack-marker-mine"
                            : "special-attack-marker-bomb";
                        const animationClass = animToken
                          ? `special-attack-animation-${animToken}`
                          : "";
                        const remaining = attack.remaining ?? attack.countdown ?? 0;
                        const isCountdown =
                          attack.trigger === "countdown" ||
                          attack.trigger === "instant";

                        return (
                          <span
                            key={attack.id}
                            className={cn(
                              baseMarkerClass,
                              kindClass,
                              animationClass,
                            )}
                            style={style}
                          >
                            <span
                              className={cn(
                                "text-[0.7rem] font-semibold text-amber-100",
                                isCountdown && "special-countdown",
                              )}
                            >
                              {isCountdown ? remaining : "⚠"}
                            </span>
                          </span>
                        );
                      })}

                      {effectsHere.map((effect) => {
                        const { base, animation, multiplier } =
                          resolveEffectClassNames(effect);
                        const radius = Math.max(1, effect.radius ?? 1);
                        const scale =
                          1 + Math.max(0, radius - 1) * multiplier;
                        const style: CSSProperties = {
                          transform: `scale(${scale})`,
                        };
                        return (
                          <span
                            key={effect.id}
                            className={cn(
                              "special-effect",
                              base,
                              animation,
                            )}
                            style={style}
                          />
                        );
                      })}

                      {piece && !piece.isHidden && (
                        <span className="relative flex items-center justify-center">
                          <span
                            className={cn(
                              "relative z-[1] bg-gradient-to-br",
                              pieceGradients[piece.color],
                              "bg-clip-text text-[clamp(1.65rem,6vw,3.25rem)] font-black tracking-tight text-transparent",
                              "drop-shadow-[0_0_18px_rgba(34,211,238,0.8)] group-hover:drop-shadow-[0_0_24px_rgba(236,72,153,0.75)]",
                            )}
                          >
                            {pieceSymbols[piece.type][piece.color]}
                          </span>
                          <span
                            className={cn(
                              "absolute inset-0 -z-[1] rounded-full bg-gradient-to-br",
                              pieceGradients[piece.color],
                              "opacity-40 blur-xl",
                            )}
                            aria-hidden="true"
                          />
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </FxProvider>
      </div>
    </div>
  );
};

export default ChessBoard;
