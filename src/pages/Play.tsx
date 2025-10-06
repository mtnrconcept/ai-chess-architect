import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import { GameState, Position, ChessPiece, ChessMove } from '@/types/chess';

const Play = () => {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState>(() => ({
    board: ChessEngine.initializeBoard(),
    currentPlayer: 'white',
    turnNumber: 1,
    movesThisTurn: 0,
    selectedPiece: null,
    validMoves: [],
    gameStatus: 'active',
    capturedPieces: [],
    moveHistory: [],
    activeRules: []
  }));

  const handlePieceClick = (piece: ChessPiece) => {
    if (piece.color !== gameState.currentPlayer) return;

    const validMoves = ChessEngine.getValidMoves(gameState.board, piece, gameState);
    setGameState(prev => ({
      ...prev,
      selectedPiece: piece,
      validMoves
    }));
  };

  const handleSquareClick = (position: Position) => {
    if (!gameState.selectedPiece) return;

    const isValid = gameState.validMoves.some(
      move => move.row === position.row && move.col === position.col
    );

    if (isValid) {
      const move: ChessMove = {
        from: gameState.selectedPiece.position,
        to: position,
        piece: gameState.selectedPiece
      };

      const newBoard = ChessEngine.executeMove(gameState.board, move, gameState);

      setGameState({
        ...gameState,
        board: newBoard,
        currentPlayer: gameState.currentPlayer === 'white' ? 'black' : 'white',
        selectedPiece: null,
        validMoves: [],
        moveHistory: [...gameState.moveHistory, move]
      });
    }
  };

  const resetGame = () => {
    setGameState({
      board: ChessEngine.initializeBoard(),
      currentPlayer: 'white',
      turnNumber: 1,
      movesThisTurn: 0,
      selectedPiece: null,
      validMoves: [],
      gameStatus: 'active',
      capturedPieces: [],
      moveHistory: [],
      activeRules: []
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Partie d'Échecs
          </h1>
          <Button variant="outline" onClick={resetGame}>
            <RotateCcw size={20} />
            Nouvelle partie
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          <div className="flex-1 flex justify-center">
            <ChessBoard
              gameState={gameState}
              onSquareClick={handleSquareClick}
              onPieceClick={handlePieceClick}
            />
          </div>

          <div className="w-full lg:w-80 space-y-4">
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Informations</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Joueur actuel:</span>
                  <span className="font-bold capitalize">{gameState.currentPlayer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tour:</span>
                  <span className="font-bold">{gameState.turnNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Coups joués:</span>
                  <span className="font-bold">{gameState.moveHistory.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Play;
