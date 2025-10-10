import { ChessPiece, Position, GameState } from '@/types/chess';

interface ChessBoardProps {
  gameState: GameState;
  onSquareClick: (position: Position) => void;
  onPieceClick: (piece: ChessPiece) => void;
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

const ChessBoard = ({ gameState, onSquareClick, onPieceClick }: ChessBoardProps) => {
  const { board, selectedPiece, validMoves } = gameState;

  const isValidMove = (row: number, col: number) => {
    return validMoves.some(move => move.row === row && move.col === col);
  };

  const isSelected = (row: number, col: number) => {
    return selectedPiece?.position.row === row && selectedPiece?.position.col === col;
  };

  return (
    <div className="relative flex w-full justify-center">
      <div className="relative mx-auto w-full max-w-full aspect-square">
        <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[conic-gradient(at_top,_rgba(34,211,238,0.55),rgba(236,72,153,0.4),rgba(129,140,248,0.45),rgba(34,211,238,0.55))] blur-3xl opacity-70 animate-neonPulse" />
        <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_60px_-25px_rgba(236,72,153,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-fuchsia-500/10" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-white/10 mix-blend-screen animate-neonShimmer" />
          <div className="relative grid h-full w-full grid-cols-8 gap-[2px] p-3 sm:p-4">
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const isLight = (rowIndex + colIndex) % 2 === 0;
                const isValidMoveSquare = isValidMove(rowIndex, colIndex);
                const isSelectedSquare = isSelected(rowIndex, colIndex);

                const handleClick = () => {
                  const position = { row: rowIndex, col: colIndex };

                  if (isValidMoveSquare) {
                    onSquareClick(position);
                    return;
                  }

                  if (piece && !piece.isHidden) {
                    onPieceClick(piece);
                  } else {
                    onSquareClick(position);
                  }
                };

                return (
                  <button
                    type="button"
                    key={`${rowIndex}-${colIndex}`}
                    onClick={handleClick}
                    className={`
                      group relative flex aspect-square items-center justify-center overflow-hidden rounded-[0.95rem]
                      border border-white/5 transition-all duration-300 ease-out
                      ${isLight
                        ? 'bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.45),rgba(2,6,23,0.92))]'
                        : 'bg-[radial-gradient(circle_at_70%_70%,rgba(236,72,153,0.55),rgba(2,6,23,0.92))]'}
                      ${isSelectedSquare ? 'ring-2 ring-cyan-300/90 shadow-[0_0_28px_rgba(56,189,248,0.75)]' : 'hover:-translate-y-[1px] hover:shadow-[0_0_22px_rgba(168,85,247,0.45)]'}
                    `}
                  >
                    {isValidMoveSquare && (
                      <span className="pointer-events-none absolute inset-0 rounded-[0.95rem] border border-cyan-300/50 animate-neonPulse" />
                    )}
                    {isValidMoveSquare && !piece && (
                      <>
                        <span className="pointer-events-none absolute h-5 w-5 rounded-full bg-cyan-300/70 blur-[1px]" />
                        <span className="pointer-events-none absolute h-5 w-5 rounded-full border border-cyan-300/80 animate-ripple" />
                      </>
                    )}
                    {piece && !piece.isHidden && (
                      <span className="relative flex items-center justify-center">
                        <span
                          className={`
                            relative z-[1] bg-gradient-to-br ${pieceGradients[piece.color]}
                            bg-clip-text text-[clamp(1.65rem,8vw,3.6rem)] font-black tracking-tight text-transparent
                            drop-shadow-[0_0_18px_rgba(34,211,238,0.8)] group-hover:drop-shadow-[0_0_24px_rgba(236,72,153,0.75)]
                          `}
                        >
                          {pieceSymbols[piece.type][piece.color]}
                        </span>
                        <span
                          className={`
                            absolute inset-0 -z-[1] rounded-full bg-gradient-to-br ${pieceGradients[piece.color]}
                            opacity-40 blur-xl
                          `}
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
