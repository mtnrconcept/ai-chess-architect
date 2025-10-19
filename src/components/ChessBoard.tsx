import type { CSSProperties } from 'react';
import { ChessPiece, Position, VisualEffect, SpecialAttackInstance, PieceColor, ChessMove } from '@/types/chess';
import { cn } from '@/lib/utils';

type MaybeMove =
  | Position
  | { to: Position }
  | { row: number; col: number }
  | { to: { row: number; col: number } };

const getMovePos = (m: MaybeMove): Position => {
  // support Position or {to: Position}
  // @ts-expect-error — be permissive
  return m?.to ? (m as { to: Position }).to : (m as Position);
};

const samePos = (a: Position | null | undefined, b: Position | null | undefined) =>
  !!a && !!b && a.row === b.row && a.col === b.col;

const sanitizeToken = (value: string | undefined | null): string =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');

/** Accepte VisualEffect.{name|animation} et un éventuel .type (projection/phantom/..). */
const resolveEffectClassNames = (effect: VisualEffect) => {
  const typeToken = sanitizeToken((effect as any).type as string);
  const animToken = sanitizeToken(((effect as any).animation as string) || ((effect as any).name as string));
  const base = typeToken === 'projection' ? 'special-hologram'
            : typeToken === 'phantom'    ? 'special-phantom'
            : 'special-explosion';
  const animation = animToken ? `${base}-${animToken}` : '';
  const multiplier = base === 'special-hologram' ? 0.22 : base === 'special-phantom' ? 0.18 : 0.3;
  return { base, animation, multiplier } as const;
};

interface ChessBoardProps {
  board: (ChessPiece | null)[][];
  selected: Position | null;
  validMoves: MaybeMove[];
  visualEffects?: VisualEffect[];
  specialAttacks?: SpecialAttackInstance[]; // optionnel, par défaut []
  onSquareClick: (position: Position) => void;
  lastMove?: ChessMove | null;
  currentPlayer?: PieceColor;
  readOnly?: boolean;
  highlightSquares?: Position[];
}

const pieceSymbols: Record<ChessPiece['type'], { white: string; black: string }> = {
  king: { white: '♔', black: '♚' },
  queen: { white: '♕', black: '♛' },
  rook: { white: '♖', black: '♜' },
  bishop: { white: '♗', black: '♝' },
  knight: { white: '♘', black: '♞' },
  pawn: { white: '♙', black: '♟' }
};

const pieceGradients: Record<ChessPiece['color'], string> = {
  white: 'from-cyan-200 via-sky-400 to-fuchsia-400',
  black: 'from-amber-200 via-rose-400 to-purple-500'
};

const ChessBoard = ({
  board,
  selected,
  validMoves,
  visualEffects = [],
  specialAttacks = [],
  onSquareClick,
  lastMove,
  currentPlayer,
  readOnly = false,
  highlightSquares = [],
}: ChessBoardProps) => {
  // Protection : si board est undefined, on utilise un plateau vide 8x8
  const safeBoard = board || Array.from({ length: 8 }, () => Array(8).fill(null));

  const isValidMove = (row: number, col: number) =>
    (validMoves ?? []).some(m => samePos(getMovePos(m), { row, col }));

  const isSelected = (row: number, col: number) => samePos(selected, { row, col });

  const isHighlighted = (row: number, col: number) =>
    (highlightSquares ?? []).some(p => samePos(p, { row, col }));

  const isLastMove = (row: number, col: number) =>
    lastMove ? samePos(lastMove.to, { row, col }) || samePos(lastMove.from, { row, col }) : false;

  return (
    <div className="relative flex w-full justify-center">
      <div
        className="relative mx-auto aspect-square w-full max-w-[min(92vw,520px)] sm:max-w-[min(85vw,560px)] lg:max-w-[520px]"
      >
        <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[conic-gradient(at_top,_rgba(34,211,238,0.55),rgba(236,72,153,0.4),rgba(129,140,248,0.45),rgba(34,211,238,0.55))] blur-3xl opacity-70 animate-neonPulse" />
        <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_60px_-25px_rgba(236,72,153,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-fuchsia-500/10" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-white/10 mix-blend-screen animate-neonShimmer" />
          <div className="relative grid h-full w-full grid-cols-8 gap-[2px] p-3 sm:p-4">
            {safeBoard.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const isLight = (rowIndex + colIndex) % 2 === 0;
                const selectedSq = isSelected(rowIndex, colIndex);
                const validSq = isValidMove(rowIndex, colIndex);
                const highlighted = isHighlighted(rowIndex, colIndex);
                const inLastMove = isLastMove(rowIndex, colIndex);

                const handleClick = () => {
                  if (readOnly) return;
                  onSquareClick({ row: rowIndex, col: colIndex });
                };

                const attacksHere = specialAttacks.filter(
                  a => a.position.row === rowIndex && a.position.col === colIndex
                );

                const effectsHere = visualEffects.filter(
                  e => e.position.row === rowIndex && e.position.col === colIndex
                );

                return (
                  <button
                    type="button"
                    key={`${rowIndex}-${colIndex}`}
                    onClick={readOnly ? undefined : handleClick}
                    aria-disabled={readOnly}
                    className={cn(
                      'group relative flex aspect-square items-center justify-center overflow-hidden rounded-[0.95rem] border border-white/5 transition-all duration-300 ease-out',
                      isLight
                        ? 'bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.45),rgba(2,6,23,0.92))]'
                        : 'bg-[radial-gradient(circle_at_70%_70%,rgba(236,72,153,0.55),rgba(2,6,23,0.92))]',
                      selectedSq
                        ? 'ring-2 ring-cyan-300/90 shadow-[0_0_28px_rgba(56,189,248,0.75)]'
                        : highlighted
                          ? 'ring-2 ring-amber-300/80 shadow-[0_0_26px_rgba(251,191,36,0.55)]'
                          : inLastMove
                            ? 'ring-2 ring-fuchsia-300/70'
                            : 'hover:-translate-y-[1px] hover:shadow-[0_0_22px_rgba(168,85,247,0.45)]',
                      readOnly && 'cursor-default'
                    )}
                  >
                    {validSq && (
                      <span className="pointer-events-none absolute inset-0 rounded-[0.95rem] border border-cyan-300/50 animate-neonPulse" />
                    )}

                    {validSq && !piece && (
                      <>
                        <span className="pointer-events-none absolute h-5 w-5 rounded-full bg-cyan-300/70 blur-[1px]" />
                        <span className="pointer-events-none absolute h-5 w-5 rounded-full border border-cyan-300/80 animate-ripple" />
                      </>
                    )}

                    {/* Marqueurs d’attaques spéciales (optionnels) */}
                    {attacksHere.map(attack => {
                      const scale = 1 + Math.max(0, (attack.radius ?? 1) - 1) * 0.25;
                      const style: CSSProperties = { transform: `scale(${scale})` };

                      // champs robustes : animation|name, countdown|remaining, trigger
                      const animToken = sanitizeToken((attack as any).animation as string) || sanitizeToken((attack as any).name as string);
                      const baseMarkerClass = 'special-attack-marker';
                      const kindClass =
                        (attack as any).ability === 'deployMine' ? 'special-attack-marker-mine' : 'special-attack-marker-bomb';
                      const animationClass = animToken ? `special-attack-animation-${animToken}` : '';
                      const remaining =
                        (attack as any).remaining ?? (attack as any).countdown ?? 0;
                      const isCountdown =
                        (attack as any).trigger === 'countdown' || (attack as any).trigger === 'instant';

                      return (
                        <span
                          key={attack.id}
                          className={cn(baseMarkerClass, kindClass, animationClass)}
                          style={style}
                        >
                          <span className={cn('text-[0.7rem] font-semibold text-amber-100', isCountdown && 'special-countdown')}>
                            {isCountdown ? remaining : '⚠'}
                          </span>
                        </span>
                      );
                    })}

                    {/* Effets visuels */}
                    {effectsHere.map(effect => {
                      const { base, animation, multiplier } = resolveEffectClassNames(effect);
                      const radius = Math.max(1, (effect as any).radius ?? 1);
                      const scale = 1 + Math.max(0, radius - 1) * multiplier;
                      const style: CSSProperties = { transform: `scale(${scale})` };
                      return (
                        <span
                          key={effect.id}
                          className={cn('special-effect', base, animation)}
                          style={style}
                        />
                      );
                    })}

                    {/* Pièce */}
                    {piece && !piece.isHidden && (
                      <span className="relative flex items-center justify-center">
                        <span
                          className={cn(
                            'relative z-[1] bg-gradient-to-br',
                            pieceGradients[piece.color],
                            'bg-clip-text text-[clamp(1.65rem,6vw,3.25rem)] font-black tracking-tight text-transparent',
                            'drop-shadow-[0_0_18px_rgba(34,211,238,0.8)] group-hover:drop-shadow-[0_0_24px_rgba(236,72,153,0.75)]'
                          )}
                        >
                          {pieceSymbols[piece.type][piece.color]}
                        </span>
                        <span
                          className={cn(
                            'absolute inset-0 -z-[1] rounded-full bg-gradient-to-br',
                            pieceGradients[piece.color],
                            'opacity-40 blur-xl'
                          )}
                          aria-hidden="true"
                        />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;
