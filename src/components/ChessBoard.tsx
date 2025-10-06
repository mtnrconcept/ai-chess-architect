import { ChessPiece, Position, GameState } from '@/types/chess';
import { Crown, Castle, Church, Gamepad2, Shield } from 'lucide-react';

interface ChessBoardProps {
  gameState: GameState;
  onSquareClick: (position: Position) => void;
  onPieceClick: (piece: ChessPiece) => void;
}

const pieceIcons = {
  king: Crown,
  queen: Crown,
  rook: Castle,
  bishop: Church,
  knight: Gamepad2,
  pawn: Shield
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
    <div className="grid grid-cols-8 gap-0 w-full max-w-2xl aspect-square border-4 border-primary shadow-card-custom rounded-lg overflow-hidden">
      {board.map((row, rowIndex) =>
        row.map((piece, colIndex) => {
          const isLight = (rowIndex + colIndex) % 2 === 0;
          const Icon = piece ? pieceIcons[piece.type] : null;
          const isValidMoveSquare = isValidMove(rowIndex, colIndex);
          const isSelectedSquare = isSelected(rowIndex, colIndex);

          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              onClick={() => {
                if (piece) {
                  onPieceClick(piece);
                } else {
                  onSquareClick({ row: rowIndex, col: colIndex });
                }
              }}
              className={`
                relative flex items-center justify-center cursor-pointer transition-all
                ${isLight ? 'bg-chess-light' : 'bg-chess-dark'}
                ${isSelectedSquare ? 'ring-4 ring-primary ring-inset' : ''}
                ${isValidMoveSquare ? 'ring-4 ring-accent ring-inset' : ''}
                hover:opacity-80
              `}
            >
              {piece && Icon && (
                <Icon
                  size={window.innerWidth < 640 ? 24 : 40}
                  className={`
                    ${piece.color === 'white' ? 'text-foreground' : 'text-background'}
                    drop-shadow-lg
                  `}
                  strokeWidth={2.5}
                />
              )}
              {isValidMoveSquare && !piece && (
                <div className="w-3 h-3 bg-accent rounded-full opacity-60" />
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default ChessBoard;
