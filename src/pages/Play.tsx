import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Settings } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import { GameState, Position, ChessPiece, ChessRule, PieceColor } from '@/types/chess';
import { allPresetRules } from '@/lib/presetRules';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { analyzeRuleLogic } from '@/lib/ruleValidation';

const Play = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as {
    customRules?: ChessRule[];
    presetRuleIds?: string[];
  } | undefined;

  const rawCustomRules = useMemo(() => {
    const custom = locationState?.customRules;
    if (!Array.isArray(custom)) return [] as ChessRule[];
    return custom;
  }, [locationState?.customRules]);

  const initialPresetRuleIds = useMemo(() => {
    const preset = locationState?.presetRuleIds;
    if (!Array.isArray(preset)) return [] as string[];
    return preset.filter(
      (ruleId): ruleId is string => typeof ruleId === 'string' && ruleId.length > 0
    );
  }, [locationState?.presetRuleIds]);

  const analyzedCustomRules = useMemo(
    () => rawCustomRules.map(rule => analyzeRuleLogic(rule).rule),
    [rawCustomRules]
  );

  const [customRules, setCustomRules] = useState<ChessRule[]>(analyzedCustomRules);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(
    () => new Set(initialPresetRuleIds)
  );
  const [appliedPresetRuleIds, setAppliedPresetRuleIds] = useState<Set<string>>(
    () => new Set(initialPresetRuleIds)
  );
  const [isRulesSheetOpen, setIsRulesSheetOpen] = useState(false);
  const presetCategoryOrder: ChessRule['category'][] = ['vip', 'movement', 'capture', 'defense', 'behavior'];
  const presetCategoryLabels: Record<ChessRule['category'], string> = {
    movement: 'Mouvement',
    capture: 'Attaque',
    special: 'Spécial',
    condition: 'Condition',
    victory: 'Victoire',
    restriction: 'Restriction',
    defense: 'Défense',
    behavior: 'Comportement',
    vip: 'VIP Magnus Goat'
  };
  const [gameState, setGameState] = useState<GameState>(() => {
    const initialBoard = ChessEngine.initializeBoard();
    return {
      board: initialBoard,
      currentPlayer: 'white',
      turnNumber: 1,
      movesThisTurn: 0,
      selectedPiece: null,
      validMoves: [],
      gameStatus: 'active',
      capturedPieces: [],
      moveHistory: [],
      activeRules: [],
      extraMoves: 0,
      pendingExtraMoves: { white: 0, black: 0 },
      freezeEffects: [],
      freezeUsage: { white: false, black: false },
      positionHistory: { [ChessEngine.getBoardSignature(initialBoard)]: 1 },
      pendingTransformations: { white: false, black: false },
      lastMoveByColor: {},
      replayOpportunities: {},
      vipTokens: { white: 0, black: 0 },
      forcedMirrorResponse: null,
      secretSetupApplied: false
    };
  });

  useEffect(() => {
    setCustomRules(analyzedCustomRules);
  }, [analyzedCustomRules]);

  const lastInitialPresetKey = useRef<string | null>(null);
  const selectionTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    const key = initialPresetRuleIds.join('|');
    if (lastInitialPresetKey.current === key) return;

    lastInitialPresetKey.current = key;
    setSelectedRules(new Set(initialPresetRuleIds));
    setAppliedPresetRuleIds(new Set(initialPresetRuleIds));
  }, [initialPresetRuleIds]);

  useEffect(() => {
    const activeCustomRules = customRules.map(rule => ({ ...rule, isActive: true }));
    const activePresetRules = allPresetRules
      .filter(rule => appliedPresetRuleIds.has(rule.ruleId))
      .map(rule => ({ ...rule, isActive: true }));

    const secretSetupEnabled = activePresetRules.some(rule => rule.ruleId === 'preset_vip_magnus_01');

    setGameState(prev => {
      let nextBoard = prev.board;
      let secretApplied = prev.secretSetupApplied;

      if (secretSetupEnabled && !secretApplied && prev.moveHistory.length === 0) {
        nextBoard = ChessEngine.applySecretSetup(prev.board);
        secretApplied = true;
      }

      const positionHistory = { ...prev.positionHistory };
      const signature = ChessEngine.getBoardSignature(nextBoard);
      if (!positionHistory[signature]) {
        positionHistory[signature] = 1;
      }

      return {
        ...prev,
        board: nextBoard,
        activeRules: [...activeCustomRules, ...activePresetRules],
        secretSetupApplied: secretApplied,
        positionHistory
      };
    });
  }, [customRules, appliedPresetRuleIds]);

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
    setAppliedPresetRuleIds(new Set(selectedRules));
    setIsRulesSheetOpen(false);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'movement': return 'bg-blue-500';
      case 'capture': return 'bg-red-500';
      case 'defense': return 'bg-green-500';
      case 'behavior': return 'bg-purple-500';
      case 'vip': return 'bg-amber-400';
      default: return 'bg-gray-500';
    }
  };

  const respawnPawn = (board: (ChessPiece | null)[][], color: PieceColor): boolean => {
    const startRow = color === 'white' ? 6 : 1;
    for (let col = 0; col < 8; col++) {
      if (!board[startRow][col]) {
        board[startRow][col] = {
          type: 'pawn',
          color,
          position: { row: startRow, col },
          hasMoved: false
        } as ChessPiece;
        return true;
      }
    }
    return false;
  };

  const handlePieceClick = (piece: ChessPiece) => {
    if (['checkmate', 'stalemate', 'draw'].includes(gameState.gameStatus)) return;
    if (piece.color !== gameState.currentPlayer) return;

    const forcedMirror = gameState.forcedMirrorResponse;
    if (forcedMirror && forcedMirror.color === piece.color) {
      if (piece.type !== 'pawn' || piece.position.col !== forcedMirror.file) {
        return;
      }
    }

    const frozen = gameState.freezeEffects.some(effect =>
      effect.color === piece.color &&
      effect.position.row === piece.position.row &&
      effect.position.col === piece.position.col &&
      effect.remainingTurns > 0
    );

    if (frozen) {
      return;
    }

    let validMoves = ChessEngine.getValidMoves(gameState.board, piece, gameState);

    const replayOpportunity = gameState.replayOpportunities[piece.color];
    if (replayOpportunity &&
      piece.position.row === replayOpportunity.to.row &&
      piece.position.col === replayOpportunity.to.col
    ) {
      const alreadyIncluded = validMoves.some(pos =>
        pos.row === replayOpportunity.from.row && pos.col === replayOpportunity.from.col
      );
      if (!alreadyIncluded) {
        validMoves = [...validMoves, replayOpportunity.from];
      }
    }

    selectionTimestampRef.current = Date.now();

    setGameState(prev => ({
      ...prev,
      selectedPiece: piece,
      validMoves
    }));
  };

  const handleSquareClick = (position: Position) => {
    if (['checkmate', 'stalemate', 'draw'].includes(gameState.gameStatus)) return;
    if (!gameState.selectedPiece) return;

    const selectedPiece = gameState.selectedPiece;

    const isValid = gameState.validMoves.some(
      move => move.row === position.row && move.col === position.col
    );

    if (!isValid) return;

    const selectionDuration = selectionTimestampRef.current
      ? Date.now() - selectionTimestampRef.current
      : null;
    selectionTimestampRef.current = null;

    const activeRuleIds = new Set(
      gameState.activeRules.filter(rule => rule.isActive).map(rule => rule.ruleId)
    );
    const hasRule = (ruleId: string) => activeRuleIds.has(ruleId);

    const move = ChessEngine.createMove(
      gameState.board,
      selectedPiece,
      position,
      gameState
    );

    let pendingTransformations = { ...gameState.pendingTransformations };
    if (
      hasRule('preset_vip_magnus_06') &&
      pendingTransformations[gameState.currentPlayer] &&
      selectedPiece.type === 'pawn'
    ) {
      move.promotion = move.promotion ?? 'knight';
      pendingTransformations = {
        ...pendingTransformations,
        [gameState.currentPlayer]: false
      };
    }

    const newBoard = ChessEngine.executeMove(gameState.board, move, gameState);
    const updatedHistory = [...gameState.moveHistory, move];
    const updatedCaptured = move.captured
      ? [...gameState.capturedPieces, move.captured]
      : [...gameState.capturedPieces];

    let forcedMirror = gameState.forcedMirrorResponse;
    if (
      forcedMirror &&
      forcedMirror.color === gameState.currentPlayer &&
      selectedPiece.type === 'pawn' &&
      selectedPiece.position.col === forcedMirror.file
    ) {
      forcedMirror = null;
    }

    const opponentColor: PieceColor =
      gameState.currentPlayer === 'white' ? 'black' : 'white';

    if (hasRule('preset_vip_magnus_02') && selectedPiece.type === 'pawn') {
      const mirrorFile = 7 - move.to.col;
      const opponentHasPawn = newBoard.some(row =>
        row.some(
          piece =>
            piece &&
            piece.type === 'pawn' &&
            piece.color === opponentColor &&
            piece.position.col === mirrorFile
        )
      );

      if (opponentHasPawn) {
        forcedMirror = { color: opponentColor, file: mirrorFile };
      } else if (forcedMirror && forcedMirror.color === opponentColor) {
        forcedMirror = null;
      }
    }

    let pendingExtraMoves = { ...gameState.pendingExtraMoves };
    if (hasRule('preset_vip_magnus_03') && move.captured) {
      pendingExtraMoves = {
        ...pendingExtraMoves,
        [opponentColor]: (pendingExtraMoves[opponentColor] ?? 0) + 1
      };
    }

    let freezeEffects = gameState.freezeEffects
      .map(effect => ({ ...effect }))
      .filter(effect => {
        const target = ChessEngine.getPieceAt(newBoard, effect.position);
        return target && target.color === effect.color && effect.remainingTurns > 0;
      });

    const freezeUsage = { ...gameState.freezeUsage };

    if (hasRule('preset_vip_magnus_09') && !freezeUsage[gameState.currentPlayer]) {
      const attackSquares = ChessEngine.getAttackSquares(newBoard, move.piece);
      const frozenTarget = attackSquares
        .map(pos => ChessEngine.getPieceAt(newBoard, pos))
        .find(piece => piece && piece.color === opponentColor);

      if (frozenTarget) {
        freezeEffects = [
          ...freezeEffects,
          {
            color: opponentColor,
            position: { ...frozenTarget.position },
            remainingTurns: 2
          }
        ];
        freezeUsage[gameState.currentPlayer] = true;
      }
    }

    let replayOpportunities = { ...gameState.replayOpportunities };
    if (replayOpportunities[gameState.currentPlayer]) {
      replayOpportunities = { ...replayOpportunities };
      delete replayOpportunities[gameState.currentPlayer];
    }

    let vipTokens = { ...gameState.vipTokens };

    if (hasRule('preset_vip_magnus_10') && move.captured?.type === 'pawn') {
      if (vipTokens[move.captured.color]) {
        const used = respawnPawn(newBoard, move.captured.color);
        if (used) {
          vipTokens = {
            ...vipTokens,
            [move.captured.color]: vipTokens[move.captured.color] - 1
          };
        }
      }
    }

    const positionHistory = { ...gameState.positionHistory };
    const signature = ChessEngine.getBoardSignature(newBoard);
    positionHistory[signature] = (positionHistory[signature] ?? 0) + 1;

    if (hasRule('preset_vip_magnus_06') && positionHistory[signature] >= 3) {
      pendingTransformations = {
        ...pendingTransformations,
        [gameState.currentPlayer]: true
      };
    }

    const lastMoveByColor = {
      ...gameState.lastMoveByColor,
      [gameState.currentPlayer]: move
    };

    const evaluationState: GameState = {
      ...gameState,
      board: newBoard,
      currentPlayer: opponentColor,
      turnNumber: gameState.turnNumber + 1,
      movesThisTurn: 0,
      selectedPiece: null,
      validMoves: [],
      gameStatus: 'active',
      capturedPieces: updatedCaptured,
      moveHistory: updatedHistory,
      extraMoves: 0,
      pendingExtraMoves,
      freezeEffects,
      freezeUsage,
      positionHistory,
      pendingTransformations,
      lastMoveByColor,
      replayOpportunities,
      vipTokens,
      forcedMirrorResponse: forcedMirror,
      secretSetupApplied: gameState.secretSetupApplied
    };

    if (hasRule('preset_vip_magnus_10') && !move.captured) {
      if (ChessEngine.isSquareAttacked(newBoard, move.to, opponentColor, evaluationState)) {
        vipTokens = {
          ...vipTokens,
          [gameState.currentPlayer]: vipTokens[gameState.currentPlayer] + 1
        };
      }
    }

    const opponentInCheck = ChessEngine.isInCheck(newBoard, opponentColor, evaluationState);
    const opponentHasMoves = ChessEngine.hasAnyLegalMoves(newBoard, opponentColor, evaluationState);

    if (hasRule('preset_vip_magnus_08') && opponentInCheck) {
      const opponentLast = gameState.lastMoveByColor[opponentColor];
      if (opponentLast) {
        replayOpportunities = {
          ...replayOpportunities,
          [opponentColor]: { from: opponentLast.from, to: opponentLast.to }
        };
        pendingExtraMoves = {
          ...pendingExtraMoves,
          [opponentColor]: (pendingExtraMoves[opponentColor] ?? 0) + 1
        };
      }
    }

    const extraMovesEarned = ChessEngine.getExtraMovesForPiece(selectedPiece, gameState);
    const instinctBonus = hasRule('preset_vip_magnus_07') &&
      selectionDuration !== null &&
      selectionDuration <= 2000 &&
      (move.captured || opponentInCheck)
        ? 1
        : 0;

    const previousExtraMoves = gameState.extraMoves;
    const remainingAfterConsumption = previousExtraMoves > 0 ? previousExtraMoves - 1 : 0;
    const totalExtraMoves = remainingAfterConsumption + extraMovesEarned + instinctBonus;

    const opponentPending = pendingExtraMoves[opponentColor] ?? 0;
    const stayOnCurrentPlayer = totalExtraMoves > 0;
    const nextExtraMoves = stayOnCurrentPlayer ? totalExtraMoves : opponentPending;
    const updatedPendingExtraMoves = stayOnCurrentPlayer
      ? pendingExtraMoves
      : { ...pendingExtraMoves, [opponentColor]: 0 };

    let nextStatus: GameState['gameStatus'] = 'active';
    if (opponentInCheck && !opponentHasMoves) {
      nextStatus = 'checkmate';
    } else if (!opponentInCheck && !opponentHasMoves) {
      nextStatus = 'stalemate';
    } else if (opponentInCheck) {
      nextStatus = 'check';
    }

    const nextMovesThisTurn = stayOnCurrentPlayer ? gameState.movesThisTurn + 1 : 0;
    const nextTurnNumber = gameState.turnNumber + 1;
    const nextPlayer = stayOnCurrentPlayer ? gameState.currentPlayer : opponentColor;

    let finalFreezeEffects = freezeEffects;
    if (!stayOnCurrentPlayer) {
      finalFreezeEffects = freezeEffects
        .map(effect => {
          if (effect.color === opponentColor) {
            return { ...effect, remainingTurns: effect.remainingTurns - 1 };
          }
          return effect;
        })
        .filter(effect => {
          const target = ChessEngine.getPieceAt(newBoard, effect.position);
          return effect.remainingTurns > 0 && target && target.color === effect.color;
        });
    }

    setGameState({
      ...gameState,
      board: newBoard,
      currentPlayer: nextStatus === 'active' || nextStatus === 'check' ? nextPlayer : opponentColor,
      turnNumber: nextTurnNumber,
      movesThisTurn: nextStatus === 'active' || nextStatus === 'check' ? nextMovesThisTurn : 0,
      selectedPiece: null,
      validMoves: [],
      gameStatus: nextStatus,
      capturedPieces: updatedCaptured,
      moveHistory: updatedHistory,
      extraMoves: nextStatus === 'active' || nextStatus === 'check' ? nextExtraMoves : 0,
      pendingExtraMoves: updatedPendingExtraMoves,
      forcedMirrorResponse: forcedMirror ?? null,
      freezeEffects: finalFreezeEffects,
      freezeUsage,
      positionHistory,
      pendingTransformations,
      lastMoveByColor,
      replayOpportunities,
      vipTokens
    });
  };

  const resetGame = () => {
    const initialBoard = ChessEngine.initializeBoard();
    setGameState({
      board: initialBoard,
      currentPlayer: 'white',
      turnNumber: 1,
      movesThisTurn: 0,
      selectedPiece: null,
      validMoves: [],
      gameStatus: 'active',
      capturedPieces: [],
      moveHistory: [],
      activeRules: gameState.activeRules,
      extraMoves: 0,
      pendingExtraMoves: { white: 0, black: 0 },
      freezeEffects: [],
      freezeUsage: { white: false, black: false },
      positionHistory: { [ChessEngine.getBoardSignature(initialBoard)]: 1 },
      pendingTransformations: { white: false, black: false },
      lastMoveByColor: {},
      replayOpportunities: {},
      vipTokens: { white: 0, black: 0 },
      forcedMirrorResponse: null,
      secretSetupApplied: false
    });
  };

  const activeCustomRulesCount = customRules.length;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050210] text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-neon-grid opacity-40" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl animate-neonPulse" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl animate-neonPulse" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => navigate('/')}> 
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Partie d'Échecs
          </h1>
          <div className="flex gap-2">
            <Sheet open={isRulesSheetOpen} onOpenChange={open => setIsRulesSheetOpen(open)}>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Settings size={20} className="mr-2" />
                  Règles ({appliedPresetRuleIds.size})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>Sélectionner les règles préinstallées</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-150px)] mt-6">
                  <div className="space-y-6">
                    {presetCategoryOrder.map(category => {
                      const categoryRules = allPresetRules.filter(r => r.category === category);
                      const categoryLabel = presetCategoryLabels[category] ?? category;

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
          <div className="rounded-xl border border-primary/30 bg-primary/15 p-4 text-sm text-primary backdrop-blur">
            {activeCustomRulesCount} règle(s) personnalisée(s) ont été importées depuis le lobby.
          </div>
        )}

        <div className="grid gap-8 justify-items-center lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex w-full justify-center">
            <ChessBoard
              gameState={gameState}
              onSquareClick={handleSquareClick}
              onPieceClick={handlePieceClick}
            />
          </div>

          <div className="w-full max-w-lg space-y-4 lg:w-80 lg:max-w-none">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_45px_-20px_rgba(59,130,246,0.55)] backdrop-blur">
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
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_45px_-20px_rgba(236,72,153,0.5)] backdrop-blur">
                <h3 className="text-lg font-bold mb-4">Règles actives</h3>
                <div className="space-y-2">
                  {gameState.activeRules.map(rule => (
                    <div key={rule.ruleId} className="rounded-xl border border-accent/40 bg-accent/20 p-3 shadow-[0_0_18px_rgba(236,72,153,0.35)]">
                      <div className="mb-1 flex items-center gap-2">
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

