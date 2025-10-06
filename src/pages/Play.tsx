import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Settings } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import { GameState, Position, ChessPiece, ChessMove, ChessRule } from '@/types/chess';
import { allPresetRules } from '@/lib/presetRules';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { analyzeRuleLogic } from '@/lib/ruleValidation';

const Play = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const rawCustomRules = useMemo(() => {
    const state = location.state as { customRules?: ChessRule[] } | undefined;
    if (!state?.customRules) return [] as ChessRule[];
    return Array.isArray(state.customRules) ? state.customRules : [];
  }, [location.state]);

  const analyzedCustomRules = useMemo(
    () => rawCustomRules.map(rule => analyzeRuleLogic(rule).rule),
    [rawCustomRules]
  );

  const [customRules, setCustomRules] = useState<ChessRule[]>(analyzedCustomRules);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
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

  const presetRuleIds = useMemo(
    () => new Set(allPresetRules.map(rule => rule.ruleId)),
    []
  );

  useEffect(() => {
    setCustomRules(analyzedCustomRules);
  }, [analyzedCustomRules]);

  useEffect(() => {
    const activeCustomRules = customRules.map(rule => ({ ...rule, isActive: true }));
    const customRuleIds = new Set(customRules.map(rule => rule.ruleId));

    setGameState(prev => ({
      ...prev,
      activeRules: [
        ...activeCustomRules,
        ...prev.activeRules.filter(rule =>
          !customRuleIds.has(rule.ruleId) &&
          (presetRuleIds.has(rule.ruleId) || rule.ruleId === undefined)
        )
      ]
    }));
  }, [customRules, presetRuleIds]);

  const toggleRule = (ruleId: string) => {
    setSelectedRules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ruleId)) {
        newSet.delete(ruleId);
      } else {
        newSet.add(ruleId);
      }
      return newSet;
    });
  };

  const applyRules = () => {
    const presetRules = allPresetRules
      .filter(rule => selectedRules.has(rule.ruleId))
      .map(rule => ({ ...rule, isActive: true }));

    setGameState(prev => ({
      ...prev,
      activeRules: [
        ...customRules.map(rule => ({ ...rule, isActive: true })),
        ...presetRules
      ]
    }));
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'movement': return 'bg-blue-500';
      case 'capture': return 'bg-red-500';
      case 'defense': return 'bg-green-500';
      case 'behavior': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

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
      activeRules: gameState.activeRules
    });
  };

  const activeCustomRulesCount = customRules.length;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Partie d'Échecs
          </h1>
          <div className="flex gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Settings size={20} className="mr-2" />
                  Règles ({selectedRules.size})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>Sélectionner les règles personnalisées</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-150px)] mt-6">
                  <div className="space-y-6">
                    {['movement', 'capture', 'defense', 'behavior'].map(category => {
                      const categoryRules = allPresetRules.filter(r => r.category === category);
                      const categoryLabel = {
                        movement: 'Mouvement',
                        capture: 'Attaque',
                        defense: 'Défense',
                        behavior: 'Comportement'
                      }[category];

                      return (
                        <div key={category} className="space-y-3">
                          <h3 className="font-bold text-lg flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${getCategoryColor(category)}`} />
                            {categoryLabel} ({categoryRules.length})
                          </h3>
                          <div className="space-y-2">
                            {categoryRules.map(rule => (
                              <div
                                key={rule.ruleId}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                              >
                                <Checkbox
                                  checked={selectedRules.has(rule.ruleId)}
                                  onCheckedChange={() => toggleRule(rule.ruleId)}
                                  className="mt-1"
                                />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{rule.ruleName}</span>
                                    <Badge variant="outline" className="text-xs">
                                      Priorité {rule.priority}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{rule.description}</p>
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {rule.affectedPieces.map(piece => (
                                      <Badge key={piece} variant="secondary" className="text-xs">
                                        {piece}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-background border-t">
                  <Button onClick={applyRules} className="w-full">
                    Appliquer {selectedRules.size} règle(s)
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="outline" onClick={resetGame}>
              <RotateCcw size={20} />
              Nouvelle partie
            </Button>
          </div>
        </div>

        {activeCustomRulesCount > 0 && (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
            {activeCustomRulesCount} règle(s) personnalisée(s) ont été importées depuis le lobby.
          </div>
        )}

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

            {gameState.activeRules.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4">Règles actives</h3>
                <div className="space-y-2">
                  {gameState.activeRules.map(rule => (
                    <div key={rule.ruleId} className="p-2 rounded bg-accent/20 border border-accent">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${getCategoryColor(rule.category)}`} />
                        <span className="text-xs font-semibold">{rule.ruleName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Play;

