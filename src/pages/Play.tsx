import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BrainCircuit, Loader2, Minus, RotateCcw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import { GameState, Position, ChessPiece, ChessRule, PieceColor, ChessMove } from '@/types/chess';
import { allPresetRules } from '@/lib/presetRules';
import { Badge } from '@/components/ui/badge';
import { analyzeRuleLogic } from '@/lib/ruleValidation';
import { getCategoryColor } from '@/lib/ruleCategories';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AiSettingSuggestion,
  AttentionLevel,
  CoachEvaluation,
  CoachInsights,
  CoachInsightsResponse,
  EloEvaluation,
  OpeningInsight,
  ProgressionInsight,
  SuccessRate,
  TacticalReaction
} from '@/types/coach';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const DEFAULT_COACH_GRAPH_POINTS = [25, 45, 65, 85] as const;

const clampNumber = (value: number, min = 0, max = 100) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const ensureString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (value == null) {
    return fallback;
  }
  const converted = String(value).trim();
  return converted.length > 0 ? converted : fallback;
};

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => ensureString(item))
    .filter((item): item is string => item.length > 0);
};

const ensureNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => toFiniteNumber(item))
    .filter((item): item is number => item != null)
    .map(item => clampNumber(item));
};

const normalizeTrend = (value: unknown): 'up' | 'down' | 'stable' => {
  if (typeof value !== 'string') {
    return 'stable';
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('up') || normalized.includes('hausse') || normalized.includes('posit')) {
    return 'up';
  }
  if (
    normalized.includes('down') ||
    normalized.includes('baisse') ||
    normalized.includes('nég') ||
    normalized.includes('neg')
  ) {
    return 'down';
  }
  return 'stable';
};

const normalizeGraphPoints = (points: unknown): number[] => {
  const sanitized = ensureNumberArray(points)
    .map(point => Math.round(point))
    .slice(-6);
  if (sanitized.length < 2) {
    return [...DEFAULT_COACH_GRAPH_POINTS];
  }

  if (sanitized.length < 4) {
    return [...DEFAULT_COACH_GRAPH_POINTS];
  }

  return sanitized.reduce<number[]>((acc, point, index) => {
    const clamped = clampNumber(point);
    if (index === 0) {
      acc.push(clamped);
      return acc;
    }
    const previous = acc[index - 1];
    const adjusted = clamped < previous ? previous : clamped;
    acc.push(adjusted);
    return acc;
  }, []);
};

const normalizeCoachInsights = (raw: Partial<CoachInsights> | null | undefined): CoachInsights => {
  const evaluationRaw = (raw?.evaluation ?? {}) as Partial<CoachEvaluation>;
  const successRateRaw = (raw?.successRate ?? {}) as Partial<SuccessRate>;
  const progressionRaw = (raw?.progression ?? {}) as Partial<ProgressionInsight>;
  const openingRaw = (raw?.opening ?? {}) as Partial<OpeningInsight>;
  const eloRaw = (raw?.eloEvaluation ?? {}) as Partial<EloEvaluation>;
  const attentionLevelsRaw = Array.isArray(raw?.attentionLevels)
    ? (raw.attentionLevels as Partial<AttentionLevel>[])
    : [];
  const tacticalReactionsRaw = Array.isArray(raw?.tacticalReactions)
    ? (raw.tacticalReactions as Partial<TacticalReaction>[])
    : [];
  const aiSettingsRaw = Array.isArray(raw?.aiSettings)
    ? (raw.aiSettings as Partial<AiSettingSuggestion>[])
    : [];

  const evaluation: CoachEvaluation = {
    score: ensureString(evaluationRaw?.score, '—'),
    trend: normalizeTrend(evaluationRaw?.trend),
    bestMoves: ensureStringArray(evaluationRaw?.bestMoves),
    threats: ensureStringArray(evaluationRaw?.threats),
    recommendation: ensureString(evaluationRaw?.recommendation, "L'analyse détaillée sera disponible après quelques coups."),
  };

  const successPercentage = clampNumber(toFiniteNumber(successRateRaw?.percentage) ?? 0);
  const successRate: SuccessRate = {
    percentage: successPercentage,
    trend: normalizeTrend(successRateRaw?.trend),
    comment: ensureString(successRateRaw?.comment, ''),
    keyFactors: ensureStringArray(successRateRaw?.keyFactors),
  };

  const progressionPoints = normalizeGraphPoints(progressionRaw?.graphPoints);
  const lastProgressPoint = progressionPoints[progressionPoints.length - 1] ?? 0;
  const progression: ProgressionInsight = {
    percentage: clampNumber(toFiniteNumber(progressionRaw?.percentage) ?? lastProgressPoint),
    summary: ensureString(progressionRaw?.summary, ''),
    graphPoints: progressionPoints,
    nextActions: ensureStringArray(progressionRaw?.nextActions),
  };

  const eloEstimate = toFiniteNumber(eloRaw?.estimate);
  const eloEvaluation: EloEvaluation = {
    estimate: eloEstimate != null ? Math.round(eloEstimate) : 1500,
    range: ensureString(eloRaw?.range, '1500-1600'),
    comment: ensureString(eloRaw?.comment, "L'évaluation Elo sera affinée après plus de coups."),
    confidence: ensureString(eloRaw?.confidence, 'moyenne'),
    improvementTips: ensureStringArray(eloRaw?.improvementTips),
  };

  const opening: OpeningInsight = {
    name: ensureString(openingRaw?.name, 'Ouverture en cours de détection'),
    variation: ensureString(openingRaw?.variation, 'Variation à identifier'),
    phase: ensureString(openingRaw?.phase, 'ouverture'),
    plan: ensureString(openingRaw?.plan, 'Suivez vos principes de développement en attendant une analyse complète.'),
    confidence: ensureString(openingRaw?.confidence, 'moyenne'),
  };

  const attentionLevels: AttentionLevel[] = attentionLevelsRaw
    .map(level => ({
      label: ensureString(level?.label, ''),
      status: ensureString(level?.status, ''),
      detail: ensureString(level?.detail, ''),
    }))
    .filter(level => level.label.length > 0 || level.detail.length > 0);

  const tacticalReactions: TacticalReaction[] = tacticalReactionsRaw
    .map(reaction => ({
      pattern: ensureString(reaction?.pattern, ''),
      advice: ensureString(reaction?.advice, ''),
    }))
    .filter(reaction => reaction.pattern.length > 0 || reaction.advice.length > 0);

  const aiSettings: AiSettingSuggestion[] = aiSettingsRaw
    .map(setting => ({
      label: ensureString(setting?.label, ''),
      current: ensureString(setting?.current, '—'),
      suggestion: ensureString(setting?.suggestion, ''),
    }))
    .filter(setting => setting.label.length > 0 || setting.suggestion.length > 0);

  return {
    analysisSummary: ensureString(raw?.analysisSummary, 'Lancez l’analyse pour obtenir des recommandations personnalisées.'),
    evaluation,
    attentionLevels,
    tacticalReactions,
    eloEvaluation,
    successRate,
    progression,
    opening,
    explainLikeImFive: ensureString(raw?.explainLikeImFive, "L’explication simplifiée sera disponible après l’analyse."),
    aiSettings,
  };
};

const Play = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as {
    customRules?: ChessRule[];
    presetRuleIds?: string[];
    opponentType?: 'ai' | 'player';
    lobbyId?: string;
    role?: 'creator' | 'opponent';
    lobbyName?: string;
    opponentName?: string;
    playerName?: string;
  } | undefined;

  const opponentType = locationState?.opponentType === 'player' ? 'player' : 'ai';
  const lobbyId = typeof locationState?.lobbyId === 'string' ? locationState.lobbyId : undefined;
  const lobbyRole = locationState?.role === 'creator' || locationState?.role === 'opponent'
    ? locationState.role
    : undefined;
  const lobbyName = typeof locationState?.lobbyName === 'string' ? locationState.lobbyName : undefined;
  const opponentName = typeof locationState?.opponentName === 'string' ? locationState.opponentName : undefined;
  const playerName = typeof locationState?.playerName === 'string' ? locationState.playerName : undefined;

  const { toast } = useToast();

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
  const activePresetRule = useMemo(() => {
    if (initialPresetRuleIds.length === 0) return null;
    const [firstRuleId] = initialPresetRuleIds;
    return allPresetRules.find(rule => rule.ruleId === firstRuleId) ?? null;
  }, [initialPresetRuleIds]);
  const appliedPresetRuleIds = useMemo(
    () => new Set(initialPresetRuleIds),
    [initialPresetRuleIds]
  );
  const selectionTimestampRef = useRef<number | null>(null);
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
      secretSetupApplied: false,
      blindOpeningRevealed: { white: false, black: false }
    };
  });

  const [coachInsights, setCoachInsights] = useState<CoachInsights | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const latestGameStateRef = useRef<GameState>(gameState);
  const lastAnalyzedMoveRef = useRef<number | null>(null);
  const coachLoadingRef = useRef(false);
  const initialAnalysisRef = useRef(false);

  useEffect(() => {
    latestGameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    coachLoadingRef.current = coachLoading;
  }, [coachLoading]);

  const files = 'abcdefgh';
  const serializeBoardForAi = useCallback((board: (ChessPiece | null)[][]) => (
    board
      .map(row =>
        row
          .map(piece => {
            if (!piece) return '.';
            const symbolMap: Record<PieceColor, Record<ChessPiece['type'], string>> = {
              white: { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' },
              black: { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }
            };
            return symbolMap[piece.color][piece.type];
          })
          .join('')
      )
      .join(' / ')
  ), []);

  const positionToNotation = useCallback((position: Position) => {
    const file = files[position.col] ?? '?';
    const rank = 8 - position.row;
    return `${file}${rank}`;
  }, [files]);

  const formatMoveForAi = useCallback((move: ChessMove) => {
    const base = `${positionToNotation(move.from)}-${positionToNotation(move.to)}`;
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    const capture = move.captured ? 'x' : '';
    const special = move.isCastling ? ' (roque)' : move.isEnPassant ? ' (prise en passant)' : '';
    return `${base}${capture}${promotion}${special}`;
  }, [positionToNotation]);

  const statusToValue = useCallback((status: string) => {
    const normalized = status.toLowerCase();
    if (normalized.includes('élev')) return 90;
    if (normalized.includes('modéré') || normalized.includes('moyen')) return 60;
    if (normalized.includes('faible')) return 35;
    return 50;
  }, []);

  const getTrendInfo = useCallback((trend?: string) => {
    const normalized = trend?.toLowerCase() ?? '';
    if (normalized.includes('up') || normalized.includes('hausse') || normalized.includes('posit')) {
      return {
        icon: <TrendingUp className="h-4 w-4 text-emerald-300" />,
        label: 'Tendance positive',
        color: 'text-emerald-300'
      };
    }
    if (
      normalized.includes('down') ||
      normalized.includes('baisse') ||
      normalized.includes('nég') ||
      normalized.includes('neg')
    ) {
      return {
        icon: <TrendingDown className="h-4 w-4 text-rose-300" />,
        label: 'Tendance négative',
        color: 'text-rose-300'
      };
    }
    return {
      icon: <Minus className="h-4 w-4 text-cyan-200" />,
      label: 'Stable',
      color: 'text-cyan-200'
    };
  }, []);

  const analyzeWithCoach = useCallback(async (trigger: 'initial' | 'auto' | 'manual') => {
    if (coachLoadingRef.current) return;

    const currentState = latestGameStateRef.current;
    const board = serializeBoardForAi(currentState.board);
    const moveHistory = currentState.moveHistory.map(formatMoveForAi);
    const activeRules = currentState.activeRules.map(rule => `${rule.ruleName}: ${rule.description}`);
    const moveCount = currentState.moveHistory.length;

    coachLoadingRef.current = true;
    setCoachLoading(true);
    setCoachError(null);
    lastAnalyzedMoveRef.current = moveCount;

    try {
      const { data, error } = await supabase.functions.invoke<CoachInsightsResponse>('chess-insights', {
        body: {
          board,
          moveHistory,
          currentPlayer: currentState.currentPlayer,
          turnNumber: currentState.turnNumber,
          gameStatus: currentState.gameStatus,
          activeRules,
          trigger
        }
      });

      if (error) {
        throw new Error(error.message ?? 'Erreur lors de l’analyse IA');
      }

      if (data?.insights) {
        const normalized = normalizeCoachInsights(data.insights);
        setCoachInsights(normalized);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la génération des insights';
      setCoachError(message);
      toast({
        title: 'Analyse IA indisponible',
        description: message,
        variant: 'destructive'
      });
    } finally {
      coachLoadingRef.current = false;
      setCoachLoading(false);
    }
  }, [formatMoveForAi, serializeBoardForAi, toast]);

  useEffect(() => {
    if (coachLoadingRef.current) return;

    if (!initialAnalysisRef.current) {
      initialAnalysisRef.current = true;
      analyzeWithCoach('initial');
      return;
    }

    if (gameState.moveHistory.length !== lastAnalyzedMoveRef.current) {
      analyzeWithCoach('auto');
    }
  }, [gameState.moveHistory.length, analyzeWithCoach]);

  useEffect(() => {
    setCustomRules(analyzedCustomRules);
  }, [analyzedCustomRules]);

  useEffect(() => {
    const activeCustomRules = customRules.map(rule => ({ ...rule, isActive: true }));
    const activePresetRules = allPresetRules
      .filter(rule => appliedPresetRuleIds.has(rule.ruleId))
      .map(rule => ({ ...rule, isActive: true }));

    const secretSetupEnabled = activePresetRules.some(rule => rule.ruleId === 'preset_vip_magnus_01');

    setGameState(prev => {
      let nextBoard = prev.board;
      let secretApplied = prev.secretSetupApplied;
      let blindOpeningRevealed = prev.blindOpeningRevealed ?? { white: false, black: false };

      if (secretSetupEnabled && !secretApplied && prev.moveHistory.length === 0) {
        nextBoard = ChessEngine.applySecretSetup(prev.board);
        secretApplied = true;
        blindOpeningRevealed = { white: false, black: false };
      }

      if (!secretSetupEnabled) {
        blindOpeningRevealed = { white: true, black: true };
        nextBoard = prev.board.map(row =>
          row.map(piece => (piece ? { ...piece, isHidden: false } : null))
        );
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
        positionHistory,
        blindOpeningRevealed
      };
    });
  }, [customRules, appliedPresetRuleIds]);

  const respawnPawn = (board: (ChessPiece | null)[][], color: PieceColor): boolean => {
    const startRow = color === 'white' ? 6 : 1;
    for (let col = 0; col < 8; col++) {
      if (!board[startRow][col]) {
        board[startRow][col] = {
          type: 'pawn',
          color,
          position: { row: startRow, col },
          hasMoved: false,
          isHidden: false
        } as ChessPiece;
        return true;
      }
    }
    return false;
  };

  const handlePieceClick = (piece: ChessPiece) => {
    if (['checkmate', 'stalemate', 'draw'].includes(gameState.gameStatus)) return;
    if (piece.color !== gameState.currentPlayer) return;
    if (piece.isHidden) return;

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

    let blindOpeningRevealed = gameState.blindOpeningRevealed ?? { white: false, black: false };

    if (
      hasRule('preset_vip_magnus_01') &&
      selectedPiece.type === 'pawn' &&
      !blindOpeningRevealed[selectedPiece.color]
    ) {
      ChessEngine.revealBackRank(newBoard, selectedPiece.color);
      blindOpeningRevealed = {
        ...blindOpeningRevealed,
        [selectedPiece.color]: true
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
      secretSetupApplied: gameState.secretSetupApplied,
      blindOpeningRevealed
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
      vipTokens,
      blindOpeningRevealed
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
      secretSetupApplied: false,
      blindOpeningRevealed: { white: false, black: false }
    });
  };

  const primaryRule = customRules[0] ?? activePresetRule ?? null;
  const activeCustomRulesCount = customRules.length;
  const tierControlSections = [
    'Régénération',
    'Analyse IA',
    'Exécution dynamique',
    'Mouvements spéciaux'
  ];

  const coachGraphPoints = useMemo(() => {
    if (coachInsights?.progression?.graphPoints?.length) {
      return coachInsights.progression.graphPoints;
    }
    return [...DEFAULT_COACH_GRAPH_POINTS];
  }, [coachInsights]);

  const coachGraphPath = useMemo(() => {
    if (coachGraphPoints.length < 2) return '';
    const min = Math.min(...coachGraphPoints);
    const max = Math.max(...coachGraphPoints);
    const range = max - min || 1;
    const verticalPadding = 10;

    return coachGraphPoints
      .map((value, index) => {
        const x = (index / (coachGraphPoints.length - 1)) * 100;
        const normalized = (value - min) / range;
        const y = 100 - normalized * (100 - verticalPadding * 2) - verticalPadding;
        return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
      })
      .join(' ');
  }, [coachGraphPoints]);

  const coachGraphAreaPath = useMemo(() => {
    if (!coachGraphPath) return '';
    return `${coachGraphPath} L 100,100 L 0,100 Z`;
  }, [coachGraphPath]);

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(40,18,78,0.58),rgba(4,3,19,0.92)_70%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(59,130,246,0.28)_0%,transparent_42%,rgba(236,72,153,0.22)_100%)] mix-blend-screen" />
        <div className="absolute inset-0 bg-[#040313]/80 backdrop-blur-[2px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(45,182,255,0.16),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(circle_at_top,rgba(255,0,128,0.18),transparent_65%)]" />
      </div>

      <div className="relative z-10">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-8 lg:px-12">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="group flex items-center gap-2 rounded-full border border-transparent bg-black/40 px-5 py-2 text-sm font-medium text-cyan-200/90 transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-white"
            >
              <ArrowLeft size={18} className="transition-transform duration-200 group-hover:-translate-x-1" />
              Retour
            </Button>
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/70">Chess Coach 3D</p>
              <h1 className="mt-2 text-3xl font-semibold text-white drop-shadow-[0_0_18px_rgba(59,130,246,0.55)] sm:text-4xl">
                Interface IA Néon Cyberpunk
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge className="border-cyan-500/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-cyan-200">
                Mode : {opponentType === 'ai' ? 'IA' : 'Multijoueur'}
              </Badge>
              {opponentType === 'player' && lobbyRole && (
                <Badge className="border-fuchsia-400/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-fuchsia-200">
                  {lobbyRole === 'creator' ? 'Hôte' : 'Adversaire'}
                </Badge>
              )}
              <Button
                variant="outline"
                onClick={resetGame}
                className="flex items-center gap-2 rounded-full border-cyan-400/60 bg-cyan-400/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200 shadow-[0_0_25px_rgba(59,130,246,0.35)] transition-all duration-200 hover:border-cyan-200 hover:bg-cyan-400/20 hover:text-white"
              >
                <RotateCcw size={16} />
                Réinitialiser
              </Button>
            </div>
          </header>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs uppercase tracking-[0.2em] text-cyan-100/70">
            <span className="text-cyan-200/90">Règle active :</span>
            {primaryRule ? (
              <Badge className="border-cyan-400/60 bg-cyan-500/10 px-3 py-1 text-[0.7rem] font-semibold text-cyan-100">
                {primaryRule.ruleName}
              </Badge>
            ) : (
              <span className="rounded-full border border-cyan-400/40 bg-black/40 px-3 py-1 font-semibold text-cyan-100">
                Standard
              </span>
            )}
            {opponentType === 'player' && lobbyName && (
              <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">
                Lobby : {lobbyName}
              </Badge>
            )}
            {opponentType === 'player' && opponentName && (
              <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">
                Adversaire : {opponentName}
              </Badge>
            )}
            {opponentType === 'player' && lobbyId && (
              <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">
                ID : {lobbyId.slice(0, 8)}…
              </Badge>
            )}
            {playerName && (
              <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">
                Joueur : {playerName}
              </Badge>
            )}
          </div>

          {activeCustomRulesCount > 0 && (
            <div className="mt-6 rounded-3xl border border-cyan-500/30 bg-cyan-500/10 px-6 py-4 text-center text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200 backdrop-blur">
              {activeCustomRulesCount} règle(s) personnalisée(s) synchronisée(s) depuis le lobby.
            </div>
          )}

          <main className="mt-10 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
            <aside className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-black/50 p-6 shadow-[0_0_45px_-12px_rgba(56,189,248,0.65)] backdrop-blur-xl">
              <div className="pointer-events-none absolute -left-24 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 border border-cyan-300/10" />
              <div className="relative z-10">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">HUD gauche</p>
                <h2 className="mt-2 text-xl font-semibold text-cyan-100">Tiers Controls</h2>

                <div className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-3 text-center shadow-[0_0_25px_rgba(56,189,248,0.35)]">
                  <p className="text-[0.65rem] uppercase tracking-[0.45em] text-cyan-200/80">Chrono IA</p>
                  <p className="mt-2 text-3xl font-bold text-white">13:5 <span className="text-sm font-semibold text-cyan-200/70">+2+5</span></p>
                </div>

                <div className="mt-6 space-y-3">
                  {tierControlSections.map((section, index) => (
                    <div
                      key={section}
                      className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-black/40 p-4 shadow-[0_0_22px_rgba(56,189,248,0.35)] transition-all duration-200 hover:border-cyan-200/60 hover:bg-cyan-500/10"
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan-300 via-cyan-500 to-fuchsia-400" />
                      <div className="ml-3">
                        <p className="text-[0.65rem] uppercase tracking-[0.5em] text-cyan-200/80">Phase {index + 1}</p>
                        <p className="mt-1 text-sm font-semibold text-white">{section}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <section className="relative flex flex-col items-center gap-6">
              <div className="relative w-full max-w-3xl">
                <div className="absolute -inset-8 rounded-[40px] border border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-fuchsia-500/10 opacity-70 blur-2xl" />
                <div className="relative rounded-[30px] border border-white/20 bg-white/5/60 p-6 backdrop-blur-xl shadow-[0_45px_75px_-35px_rgba(59,130,246,0.65)]">
                  <div className="absolute inset-0 rounded-[30px] border border-white/10" />
                  <div className="relative flex justify-center">
                    <ChessBoard
                      gameState={gameState}
                      onSquareClick={handleSquareClick}
                      onPieceClick={handlePieceClick}
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-x-12 bottom-4 h-24 rounded-full bg-gradient-to-b from-transparent via-cyan-400/10 to-cyan-400/30 blur-3xl" />
                </div>
              </div>

              <div className="grid w-full max-w-3xl gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-4 backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6rem] uppercase tracking-[0.45em] text-cyan-100/70">Joueur actuel</span>
                  <span className="text-lg font-semibold capitalize text-white">{gameState.currentPlayer}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6rem] uppercase tracking-[0.45em] text-cyan-100/70">Tour</span>
                  <span className="text-lg font-semibold text-white">{gameState.turnNumber}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6rem] uppercase tracking-[0.45em] text-cyan-100/70">Coups joués</span>
                  <span className="text-lg font-semibold text-white">{gameState.moveHistory.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[0.6rem] uppercase tracking-[0.45em] text-cyan-100/70">Statut</span>
                  <span className="text-lg font-semibold capitalize text-white">{gameState.gameStatus}</span>
                </div>
              </div>

              <div className="w-full max-w-3xl space-y-4">
                <div className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-black/50 p-6 shadow-[0_0_45px_-12px_rgba(34,211,238,0.65)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute inset-0 border border-cyan-300/10" />
                  <div className="relative flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Analyse IA</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">
                          {coachInsights?.evaluation?.score ?? '—'}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/70">
                          {coachInsights?.analysisSummary ?? 'Lancez l’analyse pour obtenir des recommandations personnalisées à chaque coup.'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => analyzeWithCoach('manual')}
                        disabled={coachLoading}
                        className="flex items-center gap-2 rounded-full border-cyan-300/60 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 transition-all duration-200 hover:border-cyan-200 hover:bg-cyan-500/20 hover:text-white"
                      >
                        {coachLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {coachLoading ? 'Analyse…' : 'Actualiser'}
                      </Button>
                    </div>

                    {coachLoading && (
                      <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calcul de nouvelles recommandations…
                      </div>
                    )}

                    {!coachLoading && coachInsights && (
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Recommandation clé</p>
                            <p className="mt-2 text-sm leading-relaxed text-white/80">{coachInsights.evaluation.recommendation}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Meilleurs coups</p>
                            <div className="flex flex-wrap gap-2">
                              {coachInsights.evaluation.bestMoves.map(move => (
                                <span
                                  key={move}
                                  className="rounded-full border border-cyan-300/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-100"
                                >
                                  {move}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <BrainCircuit className="h-5 w-5 text-cyan-200" />
                              <div>
                                <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Tendance</p>
                                {(() => {
                                  const evaluationTrend = getTrendInfo(coachInsights.evaluation.trend);
                                  return (
                                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                                      {evaluationTrend.icon}
                                      <span className={cn('uppercase tracking-[0.3em] text-xs', evaluationTrend.color)}>
                                        {evaluationTrend.label}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Menaces à surveiller</p>
                            <ul className="mt-2 space-y-2 text-sm text-white/70">
                              {coachInsights.evaluation.threats.map(threat => (
                                <li key={threat} className="flex items-start gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                                  <span>{threat}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {!coachLoading && !coachInsights && (
                      <p className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100/80">
                        L’IA se prépare à analyser votre partie. Jouez un premier coup ou lancez l’analyse manuellement.
                      </p>
                    )}

                    {coachError && (
                      <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                        {coachError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="relative overflow-hidden rounded-3xl border border-fuchsia-400/40 bg-black/40 p-5 shadow-[0_0_35px_-18px_rgba(236,72,153,0.65)] backdrop-blur-xl">
                    <div className="pointer-events-none absolute inset-0 border border-fuchsia-300/10" />
                    <div className="relative">
                      <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">Ouverture détectée</p>
                      <h4 className="mt-2 text-lg font-semibold text-white">
                        {coachInsights?.opening?.name ?? 'Analyse en cours'}
                      </h4>
                      <p className="mt-1 text-sm text-white/70">
                        {coachInsights?.opening?.variation ?? 'Les premiers coups permettront d’identifier l’ouverture.'}
                      </p>
                      {coachInsights && (
                        <>
                          <p className="mt-4 text-xs leading-relaxed text-white/70">{coachInsights.opening.plan}</p>
                          <div className="mt-4 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-fuchsia-200/70">
                            <span>{coachInsights.opening.phase}</span>
                            <span className="text-fuchsia-200">{coachInsights.opening.confidence}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-black/40 p-5 shadow-[0_0_35px_-18px_rgba(34,211,238,0.65)] backdrop-blur-xl">
                    <div className="pointer-events-none absolute inset-0 border border-cyan-300/10" />
                    <div className="relative">
                      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Évaluation Elo</p>
                      <h4 className="mt-2 text-lg font-semibold text-white">
                        {coachInsights ? `${coachInsights.eloEvaluation.estimate} Elo` : '—'}
                      </h4>
                      <p className="text-sm text-white/70">
                        {coachInsights?.eloEvaluation?.range ?? 'L’évaluation apparaîtra après l’analyse de quelques coups.'}
                      </p>
                      {coachInsights && (
                        <>
                          <p className="mt-4 text-xs leading-relaxed text-white/70">{coachInsights.eloEvaluation.comment}</p>
                          <div className="mt-4 space-y-2">
                            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-200/70">Axes de progression</p>
                            <ul className="space-y-1 text-xs text-white/70">
                              {coachInsights.eloEvaluation.improvementTips.map(tip => (
                                <li key={tip} className="flex items-start gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <p className="mt-4 text-[0.65rem] uppercase tracking-[0.35em] text-cyan-200/70">
                            Confiance : <span className="ml-2 text-cyan-100">{coachInsights.eloEvaluation.confidence}</span>
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {gameState.activeRules.length > 0 && (
                <div className="w-full max-w-3xl space-y-3">
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Règles actives</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {gameState.activeRules.map(rule => (
                      <div
                        key={rule.ruleId}
                        className="rounded-3xl border border-white/10 bg-black/50 p-4 shadow-[0_0_25px_rgba(236,72,153,0.35)] backdrop-blur-xl"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${getCategoryColor(rule.category)}`} />
                          <span className="text-sm font-semibold text-white">{rule.ruleName}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-white/70">{rule.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <div className="relative overflow-hidden rounded-3xl border border-fuchsia-500/40 bg-black/40 p-6 shadow-[0_0_45px_-12px_rgba(236,72,153,0.65)] backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-0 border border-fuchsia-300/10" />
                <div className="pointer-events-none absolute -right-20 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
                <div className="relative z-10 space-y-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">HUD droite</p>
                    <h2 className="mt-2 text-xl font-semibold text-fuchsia-100">Coach CyberIA</h2>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-3xl border border-fuchsia-300/30 bg-black/50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80">Niveaux d’attention</p>
                        <BrainCircuit className="h-5 w-5 text-fuchsia-200" />
                      </div>
                      <div className="mt-4 space-y-4">
                        {(coachInsights?.attentionLevels ?? []).map(level => (
                          <div key={`${level.label}-${level.status}`} className="space-y-2 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 p-3">
                            <div className="flex items-center justify-between text-sm font-semibold text-white/90">
                              <span>{level.label}</span>
                              <span className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80">{level.status}</span>
                            </div>
                            <Progress value={statusToValue(level.status)} className="h-2 bg-fuchsia-500/20 [&>div]:bg-gradient-to-r [&>div]:from-fuchsia-400 [&>div]:to-cyan-300" />
                            <p className="text-xs leading-relaxed text-white/70">{level.detail}</p>
                          </div>
                        ))}
                        {!coachInsights?.attentionLevels?.length && !coachLoading && (
                          <p className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100/80">
                            Les données apparaîtront après l’analyse IA.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-fuchsia-300/20 bg-black/50 p-4">
                      <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80">Réactions tactiques</p>
                      <div className="mt-4 space-y-3">
                        {(coachInsights?.tacticalReactions ?? []).map(reaction => (
                          <div key={`${reaction.pattern}-${reaction.advice}`} className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3">
                            <p className="text-sm font-semibold text-white">{reaction.pattern}</p>
                            <p className="mt-1 text-xs leading-relaxed text-white/75">{reaction.advice}</p>
                          </div>
                        ))}
                        {!coachInsights?.tacticalReactions?.length && !coachLoading && (
                          <p className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100/80">
                            L’IA remplira ce module après quelques coups.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-fuchsia-300/20 bg-black/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80">Taux de réussite</p>
                        {(() => {
                          const successTrend = getTrendInfo(coachInsights?.successRate?.trend);
                          return (
                            <span className={cn('flex items-center gap-2 rounded-full border border-fuchsia-400/30 px-3 py-1 text-[0.6rem] uppercase tracking-[0.3em]', successTrend.color)}>
                              {successTrend.icon}
                              {successTrend.label}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="mt-4 space-y-3">
                        <div>
                          <Progress value={coachInsights?.successRate?.percentage ?? 0} className="h-2 bg-fuchsia-500/20 [&>div]:bg-gradient-to-r [&>div]:from-cyan-400 [&>div]:to-fuchsia-400" />
                          <p className="mt-2 text-lg font-semibold text-white">
                            {coachInsights ? `${coachInsights.successRate.percentage}%` : '—'}
                          </p>
                        </div>
                        {coachInsights?.successRate?.comment && (
                          <p className="text-xs leading-relaxed text-white/70">{coachInsights.successRate.comment}</p>
                        )}
                        {coachInsights?.successRate?.keyFactors?.length && (
                          <ul className="space-y-1 text-xs text-white/70">
                            {coachInsights.successRate.keyFactors.map(factor => (
                              <li key={factor} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-300" />
                                <span>{factor}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-fuchsia-300/20 bg-black/60 p-4">
                      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.4em] text-fuchsia-200/80">
                        <span>Progression</span>
                        <span>{coachInsights?.progression?.percentage ? `${coachInsights.progression.percentage}%` : '—'}</span>
                      </div>
                      <div className="mt-4 h-36 w-full rounded-2xl bg-gradient-to-b from-fuchsia-500/10 via-transparent to-cyan-500/10 p-3">
                        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="coach-line" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#22d3ee" />
                              <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                            <linearGradient id="coach-fill" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
                              <stop offset="100%" stopColor="rgba(236,72,153,0.05)" />
                            </linearGradient>
                          </defs>
                          {coachGraphAreaPath && (
                            <path d={coachGraphAreaPath} fill="url(#coach-fill)" stroke="none" />
                          )}
                          {coachGraphPath && (
                            <path d={coachGraphPath} stroke="url(#coach-line)" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          )}
                        </svg>
                      </div>
                      {coachInsights?.progression?.summary && (
                        <p className="mt-3 text-xs leading-relaxed text-white/70">{coachInsights.progression.summary}</p>
                      )}
                      {coachInsights?.progression?.nextActions?.length && (
                        <ul className="mt-3 space-y-1 text-[0.7rem] text-fuchsia-100/80">
                          {coachInsights.progression.nextActions.map(action => (
                            <li key={action} className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300" />
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowExplain(value => !value)}
                      className="flex-1 rounded-full border-fuchsia-400/60 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-100 transition-all duration-200 hover:border-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-white"
                    >
                      Explain Like I'm Five
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowSettings(value => !value)}
                      className="flex-1 rounded-full border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 transition-all duration-200 hover:border-cyan-200 hover:bg-cyan-500/20 hover:text-white"
                    >
                      AI Settings
                    </Button>
                  </div>

                  {showExplain && coachInsights && (
                    <div className="rounded-3xl border border-fuchsia-300/20 bg-fuchsia-500/10 p-4 text-sm leading-relaxed text-white/85">
                      {coachInsights.explainLikeImFive}
                    </div>
                  )}

                  {showSettings && coachInsights && (
                    <div className="space-y-3 rounded-3xl border border-cyan-300/30 bg-cyan-500/10 p-4">
                      <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Paramètres IA suggérés</p>
                      <div className="space-y-3 text-sm text-white/85">
                        {coachInsights.aiSettings.map(setting => (
                          <div key={`${setting.label}-${setting.suggestion}`} className="rounded-2xl border border-cyan-400/30 bg-black/40 p-3">
                            <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">{setting.label}</p>
                            <p className="mt-1 text-xs text-cyan-100/80">Actuel : {setting.current}</p>
                            <p className="mt-2 text-sm text-white/85">{setting.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Play;

