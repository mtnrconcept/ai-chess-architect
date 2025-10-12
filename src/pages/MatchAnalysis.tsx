import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bolt,
  Brain,
  Award,
  ChartBar,
  ChartLine,
  Clock,
  Compass,
  Crosshair,
  Gamepad2,
  Flame,
  MessageSquareText,
  PlayCircle,
  Target,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Stars,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import ChessBoard from '@/components/ChessBoard';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUserGames, type StoredGameRecord } from '@/lib/gameStorage';
import {
  boardStateToString,
  deserializeBoardState,
  type AnalyzedMove,
} from '@/lib/postGameAnalysis';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseFunctionErrorMessage } from '@/integrations/supabase/errors';
import { cn } from '@/lib/utils';
import type { GameState, Position, SerializedBoardState } from '@/types/chess';
import type { CoachChatResponse } from '@/types/coach';
import { CoachPanel } from '@/features/coach/CoachPanel';
import { EvalGraph } from '@/features/coach/EvalGraph';
import { KeyMoments } from '@/features/coach/KeyMoments';
import { useCoach } from '@/features/coach/useCoach';
import { buildCoachMoves } from '@/features/coach/buildPayload';
import { coachApi } from '@/services/coachApi';

const buildReplayState = (snapshot: SerializedBoardState): GameState => ({
  board: deserializeBoardState(snapshot),
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
  positionHistory: {},
  pendingTransformations: { white: false, black: false },
  lastMoveByColor: {},
  replayOpportunities: {},
  vipTokens: { white: 0, black: 0 },
  forcedMirrorResponse: null,
  secretSetupApplied: false,
  blindOpeningRevealed: { white: false, black: false },
});

const formatDateLabel = (isoDate: string) => {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
};

const MatchAnalysis = () => {
  const { user } = useAuth();
  const [games, setGames] = useState<StoredGameRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [coachCommentary, setCoachCommentary] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [visualReplayActive, setVisualReplayActive] = useState(false);
  const coachBaseUrl = import.meta.env.VITE_COACH_ANALYSIS_URL ?? '';
  const coachRegistryRef = useRef<Map<string, string>>(new Map());
  const [coachGameId, setCoachGameId] = useState<string | null>(null);
  const [activeCoachPly, setActiveCoachPly] = useState<number | null>(null);
  const { status: coachStatus, report: coachReport } = useCoach(coachBaseUrl, coachGameId);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setSelectedGameId(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetchUserGames(user.id)
      .then(data => {
        setGames(data);
        if (data.length > 0) {
          setSelectedGameId(prev => prev ?? data[0].id);
        } else {
          setSelectedGameId(null);
        }
      })
      .catch(err => {
        console.error('Failed to load games', err);
        setError("Impossible de charger vos parties analysées.");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const selectedGame = useMemo(
    () => games.find(game => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  useEffect(() => {
    if (!selectedGame) {
      setCurrentMoveIndex(0);
      return;
    }
    setCurrentMoveIndex(selectedGame.move_history.length);
    setCoachCommentary(null);
    setCoachError(null);
  }, [selectedGame]);

  useEffect(() => {
    if (!selectedGame || !coachBaseUrl) {
      setCoachGameId(null);
      setActiveCoachPly(null);
      return;
    }

    const existing = coachRegistryRef.current.get(selectedGame.id);
    if (existing) {
      setCoachGameId(existing);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const movesPayload = buildCoachMoves(selectedGame);
        if (movesPayload.length === 0) return;

        const ingest = await coachApi.ingest(coachBaseUrl, {
          owner_id: selectedGame.user_id,
          pgn: null,
          moves: movesPayload,
          source: 'app',
        });

        if (cancelled) return;

        const remoteId = ingest?.gameId as string | undefined;
        if (!remoteId) return;

        coachRegistryRef.current.set(selectedGame.id, remoteId);
        setCoachGameId(remoteId);
        await coachApi.queue(coachBaseUrl, remoteId);
      } catch (err) {
        console.error('Failed to queue coach analysis', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedGame, coachBaseUrl]);

  const currentBoardSnapshot = useMemo(() => {
    if (!selectedGame) return null;
    if (currentMoveIndex <= 0) return selectedGame.starting_board;
    const index = Math.min(currentMoveIndex, selectedGame.move_history.length) - 1;
    return selectedGame.move_history[index]?.boardSnapshot ?? selectedGame.starting_board;
  }, [selectedGame, currentMoveIndex]);

  const replayState = useMemo(
    () => (currentBoardSnapshot ? buildReplayState(currentBoardSnapshot) : null),
    [currentBoardSnapshot],
  );

  const currentMove = useMemo<AnalyzedMove | null>(() => {
    if (!selectedGame || currentMoveIndex === 0) return null;
    return selectedGame.move_history[currentMoveIndex - 1] ?? null;
  }, [selectedGame, currentMoveIndex]);

  const highlightSquares = useMemo<Position[]>(() => {
    if (!selectedGame || currentMoveIndex === 0) return [];
    const move = selectedGame.move_history[currentMoveIndex - 1];
    return move ? [move.from, move.to] : [];
  }, [selectedGame, currentMoveIndex]);

  const movePairs = useMemo(() => {
    if (!selectedGame) return [] as Array<{ number: number; white: AnalyzedMove | null; black: AnalyzedMove | null }>;
    const pairs: Array<{ number: number; white: AnalyzedMove | null; black: AnalyzedMove | null }> = [];
    for (let index = 0; index < selectedGame.move_history.length; index += 2) {
      pairs.push({
        number: index / 2 + 1,
        white: selectedGame.move_history[index] ?? null,
        black: selectedGame.move_history[index + 1] ?? null,
      });
    }
    return pairs;
  }, [selectedGame]);

  const evaluationData = selectedGame?.analysis_overview.evaluationByMove ?? [];
  const moveTimeData = selectedGame?.analysis_overview.moveTimeBuckets.map(bucket => ({
    phase: bucket.label,
    value: bucket.value,
  })) ?? [];
  const imbalanceData = selectedGame?.analysis_overview.imbalanceByPhase.map(item => ({
    phase: item.phase,
    value: item.value,
  })) ?? [];
  const statsData = useMemo(() => selectedGame?.analysis_overview.pieceStats ?? [], [selectedGame]);
  const keyMoments = useMemo(() => selectedGame?.analysis_overview.keyMoments ?? [], [selectedGame]);
  const mistakeHistogram = useMemo(
    () =>
      selectedGame?.analysis_overview.mistakeHistogram ?? {
        blunders: 0,
        mistakes: 0,
        inaccuracies: 0,
        best: 0,
      },
    [selectedGame],
  );
  const recommendations = useMemo(() => selectedGame?.analysis_overview.recommendations ?? [], [selectedGame]);
  const summary = selectedGame?.analysis_overview.summary ?? '';

  const playerColor = selectedGame?.player_color ?? 'white';
  const playerColorLabel = playerColor === 'white' ? 'Blancs' : 'Noirs';
  const opponentColorLabel = playerColor === 'white' ? 'Noirs' : 'Blancs';
  const finalEvaluation = evaluationData.length > 0 ? evaluationData[evaluationData.length - 1]?.score ?? 0 : 0;

  const coachData = useMemo(() => {
    if (!coachReport?.moves || !Array.isArray(coachReport.moves)) {
      return { moves: [] as any[], points: [] as Array<{ ply: number; delta_ep: number; quality: string }> };
    }
    const moves = coachReport.moves.map(move => {
      let comment = move.coach_json;
      if (typeof comment === 'string') {
        try {
          comment = JSON.parse(comment);
        } catch {
          comment = null;
        }
      }
      return { ...move, coach_json: comment };
    });
    const points = moves.map(move => ({
      ply: Number(move.ply ?? 0),
      delta_ep: Number(move.delta_ep ?? 0),
      quality: move.quality ?? 'good',
    }));
    return { moves, points };
  }, [coachReport]);

  const coachKeyMoments = useMemo(() => {
    const raw = coachReport?.report?.key_moments;
    let values: unknown = raw;
    if (typeof raw === 'string') {
      try {
        values = JSON.parse(raw);
      } catch {
        values = [];
      }
    }
    if (!Array.isArray(values)) {
      return [] as Array<{ ply: number; delta_ep: number; label: string; best: string }>;
    }
    return (values as any[]).map(value => ({
      ply: Number(value?.ply ?? 0),
      delta_ep: Number(value?.delta_ep ?? 0),
      label: typeof value?.label === 'string' ? value.label : 'moment',
      best: typeof value?.best === 'string' ? value.best : '',
    }));
  }, [coachReport]);

  useEffect(() => {
    if (!coachData.moves.length) return;
    setActiveCoachPly(prev => prev ?? coachData.moves[0].ply);
  }, [coachData.moves]);

  const activeCoachComment = useMemo(() => {
    if (activeCoachPly == null) return null;
    return coachData.moves.find(move => move.ply === activeCoachPly)?.coach_json ?? null;
  }, [coachData.moves, activeCoachPly]);

  const coachLoadingAnalysis = Boolean(coachStatus && ['queued', 'running'].includes(coachStatus.status));
  const coachSummary = coachReport?.report?.summary_md ?? '';
  const coachAccuracyWhite = coachReport?.report?.accuracy_white ?? null;
  const coachAccuracyBlack = coachReport?.report?.accuracy_black ?? null;
  const coachStatusLabel = coachStatus?.status ?? (coachData.moves.length ? 'done' : coachGameId ? 'queued' : 'idle');
  const coachStatusFriendly = useMemo(() => {
    switch (coachStatusLabel) {
      case 'queued':
        return 'Analyse en file';
      case 'running':
        return 'Analyse en cours';
      case 'done':
        return 'Analyse terminée';
      case 'error':
        return 'Analyse en erreur';
      default:
        return 'En attente';
    }
  }, [coachStatusLabel]);

  const handleCoachReplay = (ply: number) => {
    setActiveCoachPly(ply);
    const moveCount = selectedGame?.move_history.length ?? 0;
    const targetIndex = Math.min(ply, moveCount);
    setCurrentMoveIndex(Math.max(targetIndex, 0));
  };

  const materialInsights = useMemo(() => {
    if (statsData.length === 0) {
      return {
        advantageLabel: 'Matériel équilibré',
        advantageColor: 'neutral' as const,
        advantageValue: 0,
        summaryText: "Aucun avantage matériel significatif n’a été détecté.",
        breakdownText: '—',
        gaugePercent: 50,
      };
    }

    const weightMap: Record<string, number> = {
      Pions: 100,
      'Pièces légères': 320,
      'Pièces lourdes': 500,
      Rois: 0,
    };

    const materialScore = statsData.reduce((score, item) => {
      const weight = weightMap[item.label] ?? 100;
      return score + (item.white - item.black) * weight;
    }, 0);

    const advantageValue = Math.round(materialScore / 100);
    const advantageColor = advantageValue > 0 ? 'white' : advantageValue < 0 ? 'black' : 'neutral';
    const advantageLabel =
      advantageColor === 'white' ? 'Avantage Blancs' : advantageColor === 'black' ? 'Avantage Noirs' : 'Matériel équilibré';

    const sideLabel =
      advantageColor === 'white' ? 'Les Blancs' : advantageColor === 'black' ? 'Les Noirs' : 'Les deux camps';

    const summaryText =
      advantageColor === 'neutral'
        ? "Le matériel est équilibré, concentre-toi sur l’activité des pièces."
        : `${sideLabel} possèdent un avantage matériel ${Math.abs(advantageValue) >= 5 ? 'net' : 'léger'}.`;

    const breakdownText = statsData
      .filter(item => item.label !== 'Rois')
      .map(item => {
        const diff = item.white - item.black;
        const symbol = diff === 0 ? '±0' : diff > 0 ? `+${diff}` : `${diff}`;
        return `${item.label} : ${symbol}`;
      })
      .join(' | ');

    const gaugePercent = Math.max(5, Math.min(95, 50 + Math.max(-40, Math.min(40, advantageValue * 4))));

    return { advantageLabel, advantageColor, advantageValue, summaryText, breakdownText, gaugePercent };
  }, [statsData]);

  const worstSwing = useMemo(() => {
    if (!selectedGame) return null;
    return selectedGame.move_history.reduce<AnalyzedMove | null>((worst, move) =>
      !worst || move.delta < worst.delta ? move : worst,
    null);
  }, [selectedGame]);

  const bestSwing = useMemo(() => {
    if (!selectedGame) return null;
    return selectedGame.move_history.reduce<AnalyzedMove | null>((best, move) =>
      !best || move.delta > best.delta ? move : best,
    null);
  }, [selectedGame]);

  const evaluationNarrative = useMemo(() => {
    if (!selectedGame || selectedGame.move_history.length === 0) {
      return "Charge une partie pour obtenir une histoire complète de l’évaluation.";
    }

    const lowest = selectedGame.move_history.reduce<AnalyzedMove | null>((min, move) =>
      !min || move.materialBalance < min.materialBalance ? move : min,
    null);
    const highest = selectedGame.move_history.reduce<AnalyzedMove | null>((max, move) =>
      !max || move.materialBalance > max.materialBalance ? move : max,
    null);

    if (!lowest || !highest) {
      return "Évaluation stable tout au long de la partie.";
    }

    const comebackMoment = selectedGame.move_history.find(move =>
      (lowest.materialBalance < 0 && move.materialBalance > 0) ||
      (lowest.materialBalance > 0 && move.materialBalance < 0),
    );

    if (lowest.materialBalance < 0 && highest.materialBalance > 0 && comebackMoment) {
      return `${opponentColorLabel} dominaient au ${lowest.moveNumber}e coup, mais ${playerColorLabel} ont repris l’avantage au ${comebackMoment.moveNumber}e avec ${comebackMoment.notation}.`;
    }

    if (highest.materialBalance > 0) {
      return `${playerColorLabel} ont progressivement pris l’avantage jusqu’au ${highest.moveNumber}e coup (${highest.notation}).`;
    }

    if (lowest.materialBalance < 0) {
      return `${opponentColorLabel} ont conservé la pression jusqu’au ${lowest.moveNumber}e coup (${lowest.notation}).`;
    }

    return "Partie très équilibrée, aucun camp n’a créé d’écart décisif.";
  }, [opponentColorLabel, playerColorLabel, selectedGame]);

  const evaluationHighlights = useMemo(() => {
    if (!selectedGame) return [] as Array<{ moveNumber: number; message: string }>;
    const highlights: Array<{ moveNumber: number; message: string }> = [];
    if (worstSwing) {
      highlights.push({
        moveNumber: worstSwing.moveNumber,
        message: `${worstSwing.notation} — perte de ${Math.abs(Math.round(worstSwing.delta / 100))} pts matériels`,
      });
    }
    if (bestSwing) {
      highlights.push({
        moveNumber: bestSwing.moveNumber,
        message: `${bestSwing.notation} — gain de ${Math.abs(Math.round(bestSwing.delta / 100))} pts`,
      });
    }
    return highlights.sort((a, b) => a.moveNumber - b.moveNumber);
  }, [bestSwing, selectedGame, worstSwing]);

  const materialNarrative = useMemo(() => {
    if (!selectedGame) {
      return "Le déséquilibre matériel sera affiché après l’analyse d’une partie.";
    }

    if (worstSwing && bestSwing && worstSwing.moveNumber < bestSwing.moveNumber && worstSwing.delta < 0 && bestSwing.delta > 0) {
      return `${opponentColorLabel} dominaient au ${worstSwing.moveNumber}e coup (${worstSwing.notation}), mais ${playerColorLabel} ont renversé la tendance au ${bestSwing.moveNumber}e grâce à ${bestSwing.notation}.`;
    }

    if (materialInsights.advantageColor === 'neutral') {
      return 'Les échanges sont restés équilibrés : aucun camp n’a pris l’ascendant matériel durablement.';
    }

    const dominantSide = materialInsights.advantageColor === 'white' ? 'Les Blancs' : 'Les Noirs';
    const anchorMove = bestSwing && bestSwing.delta > 0 ? bestSwing : worstSwing;
    const anchorSuffix = anchorMove ? ` autour du coup ${anchorMove.moveNumber} (${anchorMove.notation})` : '';

    return `${dominantSide} ont façonné l’avantage matériel${anchorSuffix}.`;
  }, [bestSwing, materialInsights.advantageColor, opponentColorLabel, playerColorLabel, selectedGame, worstSwing]);

  const mistakeDetails = useMemo(
    () => [
      {
        label: 'Grosse erreur',
        value: mistakeHistogram.blunders,
        explanation: 'Tu as perdu une pièce sans compensation.',
      },
      {
        label: 'Erreur',
        value: mistakeHistogram.mistakes,
        explanation: 'Tu as raté un meilleur coup évident.',
      },
      {
        label: 'Inexactitude',
        value: mistakeHistogram.inaccuracies,
        explanation: 'Petites imprécisions sans gravité.',
      },
      {
        label: 'Coups solides',
        value: mistakeHistogram.best,
        explanation: 'Excellente stabilité de ton jeu.',
      },
    ],
    [mistakeHistogram],
  );

  const computeScore = (value: number, min: number, max: number) => {
    const clamped = Math.max(min, Math.min(max, value));
    return Math.round(clamped * 10) / 10;
  };

  const accuracy = selectedGame?.accuracy ?? 0;
  const precisionScore = computeScore(accuracy / 10, 4, 10);
  const tacticPenalty = mistakeHistogram.blunders * 2 + mistakeHistogram.mistakes * 1.2 + mistakeHistogram.inaccuracies * 0.5;
  const tacticScore = computeScore(10 - tacticPenalty, 3, 10);
  const strategyScore = computeScore(7 + Math.sign(finalEvaluation) * 1.5 + (materialInsights.advantageValue / 4), 3, 10);
  const slowMoves = moveTimeData.find(bucket => bucket.phase === '30s+')?.value ?? 0;
  const timeScore = computeScore(9 - slowMoves * 0.4, 2, 10);
  const overallScore = Math.max(40, Math.min(100, Math.round((strategyScore + tacticScore + precisionScore + timeScore) * 2)));

  const scoreBreakdown = useMemo(
    () => [
      { label: 'Stratégie', value: strategyScore },
      { label: 'Tactique', value: tacticScore },
      { label: 'Précision', value: precisionScore },
      { label: 'Gestion du temps', value: timeScore },
    ],
    [precisionScore, strategyScore, tacticScore, timeScore],
  );

  const strengths = useMemo(() => {
    const topStrength =
      overallScore > 85
        ? 'Conversion clinique de l’avantage.'
        : materialInsights.advantageValue > 0
          ? 'Bonne gestion du matériel en finale.'
          : 'Solide résistance sous pression.';

    const weakness =
      mistakeHistogram.blunders > 0
        ? 'Surveille la sécurité de tes pièces majeures.'
        : slowMoves > 3
          ? 'Accélère ta prise de décision en zeitnot.'
          : 'Cherche des plans plus actifs dès l’ouverture.';

    const aiTip = recommendations[0] ?? 'Continue de varier les plans pour surprendre tes adversaires.';

    return { topStrength, weakness, aiTip };
  }, [materialInsights.advantageValue, overallScore, recommendations, slowMoves, mistakeHistogram.blunders]);

  const summaryNarrative = useMemo(() => {
    if (!selectedGame) {
      return "Sélectionne une partie pour découvrir ton récit personnalisé.";
    }
    const base = summary ||
      `${playerColorLabel} ont disputé ${selectedGame.total_moves} coups avec une précision de ${accuracy.toFixed(1)} %.`;
    return `${base}\n${evaluationNarrative}`;
  }, [accuracy, evaluationNarrative, playerColorLabel, selectedGame, summary]);

  const progressData = useMemo(() => {
    if (games.length === 0) return [] as Array<{ label: string; value: number }>;
    const ordered = [...games].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return ordered.map((game, index) => ({
      label: `Partie ${index + 1}`,
      value: game.accuracy ?? 0,
    }));
  }, [games]);

  const latestImprovement = useMemo(() => {
    if (progressData.length < 2) return 0;
    const last = progressData[progressData.length - 1];
    const previous = progressData[progressData.length - 2];
    return Math.round((last.value - previous.value) * 10) / 10;
  }, [progressData]);

  useEffect(() => {
    if (!visualReplayActive || !selectedGame) {
      return;
    }

    const orderedMoments = [...keyMoments].sort((a, b) => a.moveNumber - b.moveNumber);
    const indices = orderedMoments
      .map(moment => {
        const exactIndex = selectedGame.move_history.findIndex(
          move => move.moveNumber === moment.moveNumber && move.notation === moment.notation,
        );
        if (exactIndex >= 0) {
          return exactIndex + 1;
        }
        const approximateIndex = selectedGame.move_history.findIndex(move => move.moveNumber === moment.moveNumber);
        return approximateIndex >= 0 ? approximateIndex + 1 : null;
      })
      .filter((value): value is number => typeof value === 'number');

    if (indices.length === 0) {
      setVisualReplayActive(false);
      return;
    }

    let pointer = 0;
    setCurrentMoveIndex(indices[pointer]);
    const interval = setInterval(() => {
      pointer += 1;
      if (pointer >= indices.length) {
        clearInterval(interval);
        setVisualReplayActive(false);
        return;
      }
      setCurrentMoveIndex(indices[pointer]);
    }, 2000);

    return () => {
      clearInterval(interval);
      setVisualReplayActive(false);
    };
  }, [keyMoments, selectedGame, setCurrentMoveIndex, visualReplayActive]);

  const blunderData = [
    { phase: 'Grosses erreurs', value: mistakeHistogram.blunders },
    { phase: 'Erreurs', value: mistakeHistogram.mistakes },
  ];

  const mistakeData = [
    { phase: 'Inexactitudes', value: mistakeHistogram.inaccuracies },
    { phase: 'Coups solides', value: mistakeHistogram.best },
  ];

  const totalMoves = selectedGame?.move_history.length ?? 0;

  const handleSliderChange = (value: number[]) => {
    if (!selectedGame) return;
    const next = value[0] ?? 0;
    const clamped = Math.max(0, Math.min(Math.round(next), selectedGame.move_history.length));
    setCurrentMoveIndex(clamped);
  };

  const goPrevious = () => {
    setCurrentMoveIndex(index => Math.max(index - 1, 0));
  };

  const goNext = () => {
    setCurrentMoveIndex(index => {
      if (!selectedGame) return index;
      return Math.min(index + 1, selectedGame.move_history.length);
    });
  };

  const handleRequestCoachCommentary = async () => {
    if (!selectedGame || !currentBoardSnapshot) return;
    setCoachLoading(true);
    setCoachError(null);

    const board = boardStateToString(currentBoardSnapshot);
    const history = selectedGame.move_history
      .slice(0, currentMoveIndex)
      .map(move => move.notation);

    try {
      const { data, error } = await supabase.functions.invoke<CoachChatResponse>('chess-insights', {
        body: {
          board,
          moveHistory: history,
          currentPlayer: currentMoveIndex % 2 === 0 ? 'white' : 'black',
          turnNumber: Math.max(1, Math.floor((currentMoveIndex + 1) / 2)),
          gameStatus: currentMoveIndex === selectedGame.move_history.length
            ? selectedGame.result === 'draw'
              ? 'draw'
              : 'checkmate'
            : 'active',
          activeRules: [],
          trigger: 'manual',
          userMessage: currentMove
            ? `Analyse la position après ${currentMove.notation} et donne-moi le plan.`
            : 'Analyse la position initiale de cette partie enregistrée.',
        },
      });

      if (error) throw new Error(error.message ?? 'Erreur de génération');

      const content = data?.message?.trim();
      if (!content) throw new Error('Réponse vide du coach');

      setCoachCommentary(content);
    } catch (err) {
      const message = getSupabaseFunctionErrorMessage(err, "Le coach IA est indisponible pour le moment.");
      setCoachError(message);
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030314] px-6 py-6 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,230,255,0.22),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_85%,rgba(255,0,200,0.18),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-cyan-500/25 bg-black/50 p-8 shadow-[0_0_45px_rgba(34,211,238,0.25)] backdrop-blur-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/80">Voltus Chess</span>
              <h1 className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-bold text-transparent">
                Analyse post-partie
              </h1>
              <p className="text-sm text-cyan-100/70">
                Revivez vos parties, mesurez l’évolution de votre précision et obtenez un coaching ciblé sur vos habitudes de jeu.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {user ? (
                <Select value={selectedGameId ?? ''} onValueChange={value => setSelectedGameId(value)}>
                  <SelectTrigger className="w-[260px] rounded-2xl border-cyan-400/40 bg-black/60 text-left text-xs uppercase tracking-[0.3em] text-cyan-100">
                    <SelectValue placeholder={loading ? 'Chargement…' : 'Sélectionner une partie'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 border-cyan-400/30 bg-black/80 text-cyan-100">
                    {games.map(game => (
                      <SelectItem key={game.id} value={game.id} className="text-sm">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-white">{formatDateLabel(game.created_at)}</span>
                          <span className="text-xs text-cyan-200/70">{game.variant_name ?? 'Standard'} · {game.time_control ?? 'Sans limite'}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {games.length === 0 && !loading && (
                      <div className="px-3 py-2 text-sm text-cyan-200/70">Aucune partie enregistrée pour le moment.</div>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Badge className="rounded-full border-cyan-500/40 bg-cyan-500/10 text-xs uppercase tracking-[0.3em] text-cyan-100">
                  Connectez-vous pour activer l’analyse
                </Badge>
              )}
              {selectedGame && (
                <Badge className="rounded-full border-cyan-500/40 bg-cyan-500/10 text-xs uppercase tracking-[0.3em] text-cyan-100">
                  {selectedGame.result === 'win' ? 'Victoire' : selectedGame.result === 'loss' ? 'Défaite' : 'Nulle'} · {selectedGame.total_moves} coups
                </Badge>
              )}
            </div>
          </div>
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/60 p-6 shadow-inner shadow-cyan-500/25">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-100">
                    <Brain className="h-6 w-6" />
                  </span>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-white">Résumé de ta partie</h2>
                    <div className="space-y-1 text-sm leading-relaxed text-cyan-100/80">
                      {summaryNarrative.split('\n').map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant="outline" className="flex items-center gap-2 rounded-full border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-cyan-100">
                    🥇 Point fort · {strengths.topStrength}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-2 rounded-full border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-100">
                    ⚠️ Point faible · {strengths.weakness}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-2 rounded-full border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-fuchsia-100">
                    💡 Conseil IA · {strengths.aiTip}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-black/70 p-4 text-xs text-cyan-100/70">
                <div className="flex items-center gap-2 font-semibold text-cyan-100">
                  <Stars className="h-4 w-4 text-amber-300" />
                  Légende pédagogique
                </div>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2"><span className="text-base">♟️</span> Pion : petit avantage</li>
                  <li className="flex items-center gap-2"><span className="text-base">🧱</span> Tour : avantage matériel</li>
                  <li className="flex items-center gap-2"><span className="text-base">⚡</span> Coup critique</li>
                  <li className="flex items-center gap-2"><span className="text-base">🧠</span> Recommandation IA</li>
                </ul>
              </div>
            </div>
          </Card>
          <div className="grid gap-6 md:grid-cols-[minmax(0,240px)_1fr]">
            <Card className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-cyan-500/10 shadow-inner shadow-cyan-500/20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),transparent_70%)]" />
              <CardContent className="relative z-10 flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="relative flex h-40 w-40 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-cyan-400/40" />
                  <div className="absolute inset-4 rounded-full border border-fuchsia-400/40" />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(from 140deg, rgba(34,211,238,0.45) 0deg, rgba(34,211,238,0.45) ${Math.round((accuracy / 100) * 360)}deg, rgba(15,23,42,0.35) ${Math.round((accuracy / 100) * 360)}deg)`
                    }}
                  />
                  <div className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-full bg-black/70 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
                    <span className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Précision</span>
                    <span className="text-4xl font-bold text-white">{accuracy.toFixed(1)}%</span>
                  </div>
                </div>
                {selectedGame && (
                  <Badge variant="outline" className="rounded-full border-cyan-400/40 bg-cyan-500/10 text-cyan-100">
                    Analyse du {formatDateLabel(selectedGame.created_at)}
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 p-6 shadow-inner shadow-cyan-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0">
                <div>
                  <CardTitle className="text-lg font-semibold text-white">Moments clés</CardTitle>
                  <p className="text-xs text-cyan-100/60">Les séquences qui ont modifié l’évaluation générale de la partie.</p>
                </div>
                <Bolt className="h-6 w-6 text-amber-300" />
              </CardHeader>
              <CardContent className="mt-6 grid gap-4 p-0 sm:grid-cols-2">
                {keyMoments.length === 0 && (
                  <p className="text-sm text-cyan-100/70">Aucun moment décisif identifié sur cette partie.</p>
                )}
                {keyMoments.slice(0, 4).map((moment, index) => {
                  const icons = [Flame, Crosshair, Compass, ChartBar];
                  const Icon = icons[index] ?? Flame;
                  return (
                    <div key={moment.id} className="flex flex-col gap-3 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/30 bg-black/60">
                            <Icon className="h-5 w-5 text-cyan-200" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">{moment.label}</p>
                            <p className="text-xs text-cyan-100/60">{moment.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-cyan-100">{moment.value > 0 ? `+${moment.value}` : moment.value} ♟︎</span>
                      </div>
                      <span className="text-xs uppercase tracking-[0.2em] text-cyan-100/60">Coup {moment.moveNumber} · {moment.notation}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </header>

        <Card className="rounded-3xl border border-cyan-400/25 bg-black/40 p-6 shadow-[0_0_45px_rgba(34,211,238,0.2)] backdrop-blur-xl">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-white">Relecture interactive</CardTitle>
              <p className="text-sm text-cyan-100/70">Faites défiler les coups pour revivre la partie et obtenir un commentaire personnalisé du coach IA.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={goPrevious}
                disabled={currentMoveIndex === 0}
                className="h-9 w-9 rounded-full border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={goNext}
                disabled={!selectedGame || currentMoveIndex === totalMoves}
                className="h-9 w-9 rounded-full border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setVisualReplayActive(true)}
                disabled={!selectedGame || keyMoments.length === 0 || visualReplayActive}
                className="flex items-center gap-2 rounded-full border-amber-400/40 bg-amber-500/10 px-5 text-amber-100 hover:bg-amber-500/20"
              >
                {visualReplayActive ? 'Lecture en cours…' : 'Rejouer les moments clés'}
                <PlayCircle className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleRequestCoachCommentary}
                disabled={!selectedGame || coachLoading}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-5 text-black shadow-[0_0_25px_rgba(34,211,238,0.35)]"
              >
                {coachLoading ? 'Analyse…' : 'Commentaire du coach'}
                <MessageSquareText className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-cyan-400/30 bg-black/40 p-4 shadow-inner shadow-cyan-500/20">
                {replayState ? (
                  <ChessBoard
                    gameState={replayState}
                    onPieceClick={() => {}}
                    onSquareClick={() => {}}
                    readOnly
                    highlightSquares={highlightSquares}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-cyan-200/70">
                    Sélectionnez une partie à analyser.
                  </div>
                )}
              </div>
              {visualReplayActive && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <PlayCircle className="h-4 w-4" />
                  Relecture automatique des moments clés en cours…
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-cyan-200/60">
                  <span>{currentMoveIndex === 0 ? 'Position initiale' : `Après ${currentMoveIndex} coups`}</span>
                  <span>{totalMoves} coups au total</span>
                </div>
                <Slider
                  value={[currentMoveIndex]}
                  onValueChange={handleSliderChange}
                  min={0}
                  max={totalMoves}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
            <div className="space-y-4">
              <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_25px_rgba(34,211,238,0.2)]">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold text-white">Feuille de partie</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="max-h-64">
                    <table className="w-full text-left text-xs text-cyan-100/80">
                      <tbody>
                        {movePairs.map(pair => {
                          const whiteActive = currentMove?.index === pair.white?.index;
                          const blackActive = currentMove?.index === pair.black?.index;
                          return (
                            <tr key={pair.number} className="border-b border-white/5">
                              <td className="px-4 py-2 text-cyan-200/70">{pair.number}.</td>
                              <td
                                className={cn(
                                  'px-4 py-2',
                                  whiteActive && 'rounded-xl bg-cyan-500/20 text-white'
                                )}
                              >
                                {pair.white ? pair.white.notation : '—'}
                              </td>
                              <td
                                className={cn(
                                  'px-4 py-2',
                                  blackActive && 'rounded-xl bg-fuchsia-500/20 text-white'
                                )}
                              >
                                {pair.black ? pair.black.notation : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border border-fuchsia-400/30 bg-black/50 p-4 shadow-[0_0_25px_rgba(217,70,239,0.25)]">
                <CardHeader className="p-0 pb-3">
                  <CardTitle className="text-sm font-semibold text-white">Commentaire du coach</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-0 text-sm text-fuchsia-100/80">
                  {coachCommentary && <p className="whitespace-pre-line leading-relaxed">{coachCommentary}</p>}
                  {!coachCommentary && !coachError && (
                    <p className="text-xs text-fuchsia-100/60">Déplacez le curseur et demandez une analyse pour obtenir un compte rendu ciblé.</p>
                  )}
                  {coachError && (
                    <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">{coachError}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Évaluation</CardTitle>
              <ChartLine className="h-5 w-5 text-cyan-300" />
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-0">
              <p className="text-sm leading-relaxed text-cyan-100/80">{evaluationNarrative}</p>
              <ChartContainer config={{ score: { label: 'Évaluation', color: 'hsl(183 97% 58%)' } }} className="h-48">
                <LineChart data={evaluationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.2)" />
                  <XAxis dataKey="move" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Line type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={3} dot={false} />
                  <ChartTooltip cursor={{ stroke: 'rgba(34,211,238,0.4)', strokeWidth: 1 }} content={<ChartTooltipContent />} />
                </LineChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-2">
                {evaluationHighlights.map(highlight => (
                  <button
                    key={highlight.moveNumber}
                    type="button"
                    onClick={() => {
                      const targetIndex = selectedGame?.move_history.findIndex(
                        move => move.moveNumber === highlight.moveNumber,
                      );
                      if (targetIndex !== undefined && targetIndex >= 0) {
                        setCurrentMoveIndex(targetIndex + 1);
                      }
                    }}
                    className="group flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-300 transition group-hover:scale-110" />
                    Coup {highlight.moveNumber} · {highlight.message}
                  </button>
                ))}
                {evaluationHighlights.length === 0 && (
                  <span className="text-xs text-cyan-100/60">Aucun basculement majeur détecté.</span>
                )}
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-cyan-400/20 bg-black/60 p-4">
                <div className="flex items-center justify-between text-sm text-cyan-100">
                  <span className="font-semibold uppercase tracking-[0.2em] text-cyan-100/80">Évaluation finale</span>
                  <span className="text-lg font-bold text-white">
                    {finalEvaluation > 0 ? `+${finalEvaluation.toFixed(1)}` : finalEvaluation.toFixed(1)} ({
                      finalEvaluation > 0 ? `${playerColorLabel}` : finalEvaluation < 0 ? `${opponentColorLabel}` : 'Équilibre'
                    })
                  </span>
                </div>
                <p className="text-xs text-cyan-100/70">
                  {recommendations[1] ?? 'Tu aurais pu conclure plus vite en activant tes pièces lourdes.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(255,0,200,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Temps par coup</CardTitle>
              <Clock className="h-5 w-5 text-fuchsia-300" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <ChartContainer config={{ value: { label: 'Coups', color: 'hsl(316 91% 58%)' } }} className="h-48">
                <BarChart data={moveTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(236,72,153,0.15)" vertical={false} />
                  <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Bar dataKey="value" radius={8} fill="var(--color-value)" />
                  <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(236,72,153,0.08)' }} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(255,180,0,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Déséquilibre matériel</CardTitle>
              <ChartBar className="h-5 w-5 text-amber-300" />
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-0">
              <p className="text-sm leading-relaxed text-amber-100/80">{materialNarrative}</p>
              <ChartContainer config={{ value: { label: 'Avantage', color: 'hsl(49 100% 64%)' } }} className="h-48">
                <AreaChart data={imbalanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,204,21,0.2)" />
                  <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="rgba(250,204,21,0.25)" strokeWidth={3} />
                  <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                </AreaChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-2">
                {keyMoments.slice(0, 3).map(moment => (
                  <button
                    key={moment.id}
                    type="button"
                    onClick={() => {
                      const index = selectedGame?.move_history.findIndex(
                        move => move.moveNumber === moment.moveNumber && move.notation === moment.notation,
                      );
                      if (index !== undefined && index >= 0) {
                        setCurrentMoveIndex(index + 1);
                      }
                    }}
                    className="group flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-500/20"
                  >
                    <Flame className="h-3.5 w-3.5 text-orange-300 transition group-hover:rotate-6" />
                    {moment.moveNumber}e coup · {moment.description}
                  </button>
                ))}
                {keyMoments.length === 0 && <span className="text-xs text-amber-100/60">Aucun basculement détecté.</span>}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Erreurs critiques</CardTitle>
              <Flame className="h-5 w-5 text-orange-300" />
            </CardHeader>
            <CardContent className="space-y-5 p-6 pt-0">
              <div className="overflow-hidden rounded-2xl border border-orange-400/30 bg-black/60">
                <table className="w-full text-sm text-orange-100/80">
                  <thead className="bg-orange-500/10 text-xs uppercase tracking-[0.2em] text-orange-100/70">
                    <tr>
                      <th className="px-4 py-3 text-left">Catégorie</th>
                      <th className="px-4 py-3 text-left">Nombre</th>
                      <th className="px-4 py-3 text-left">Explication rapide</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mistakeDetails.map(detail => (
                      <tr key={detail.label} className="border-t border-white/5">
                        <td className="px-4 py-3 font-semibold text-white">{detail.label}</td>
                        <td className="px-4 py-3">{detail.value}</td>
                        <td className="px-4 py-3 text-xs text-orange-100/70">{detail.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {worstSwing && (
                <div className="flex items-center gap-3 rounded-2xl border border-orange-400/40 bg-orange-500/10 p-4 text-sm text-orange-100">
                  <span className="text-xl animate-pulse">🔥</span>
                  Coup clé : {worstSwing.moveNumber} ({worstSwing.notation}) —
                  l’évaluation a chuté de {Math.abs(Math.round(worstSwing.delta / 100))} points.
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-100/70">Grosses erreurs</h3>
                  <ChartContainer config={{ value: { label: 'Blunders', color: 'hsl(7 88% 55%)' } }} className="h-40">
                    <BarChart data={blunderData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(248,113,113,0.2)" vertical={false} />
                      <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                      <Bar dataKey="value" radius={10} fill="var(--color-value)" />
                      <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(248,113,113,0.12)' }} />
                    </BarChart>
                  </ChartContainer>
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-100/70">Inexactitudes</h3>
                  <ChartContainer config={{ value: { label: 'Mistakes', color: 'hsl(276 92% 65%)' } }} className="h-40">
                    <BarChart data={mistakeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(192,132,252,0.2)" vertical={false} />
                      <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                      <Bar dataKey="value" radius={10} fill="var(--color-value)" />
                      <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(192,132,252,0.12)' }} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Statistiques matériaux</CardTitle>
              <Target className="h-5 w-5 text-cyan-300" />
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-0">
              <div className="space-y-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm text-cyan-100/80">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{materialInsights.summaryText}</p>
                    <p className="text-xs text-cyan-100/70">{materialInsights.breakdownText}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-cyan-400/40 bg-black/60 px-3 py-1 text-xs text-cyan-100">
                    {materialInsights.advantageLabel} ({materialInsights.advantageValue >= 0 ? `+${materialInsights.advantageValue}` : materialInsights.advantageValue} pts)
                  </Badge>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-black/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400"
                    style={{ width: `${materialInsights.gaugePercent}%` }}
                  />
                </div>
                <p className="text-xs text-cyan-100/60">{playerColorLabel} à gauche · {opponentColorLabel} à droite</p>
              </div>
              <div className="grid gap-3">
                {statsData.map(item => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/50 p-4">
                    <span className="text-sm font-semibold text-white">{item.label}</span>
                    <div className="flex items-center gap-3 text-xs text-cyan-100/70">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" /> Blancs : {item.white}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400" /> Noirs : {item.black}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {selectedGame && coachBaseUrl && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
                <CardTitle className="text-lg font-semibold text-white">Coach post-partie</CardTitle>
                <Bolt className="h-5 w-5 text-cyan-300" />
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-0">
                <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-black/60 px-4 py-3 text-xs uppercase tracking-[0.25em] text-cyan-100/70">
                  <span>Statut</span>
                  <Badge variant="outline" className="rounded-full border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[0.7rem] tracking-[0.2em] text-cyan-100">
                    {coachStatusFriendly}
                  </Badge>
                </div>
                {coachData.points.length > 0 ? (
                  <EvalGraph points={coachData.points} />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-2xl border border-cyan-400/20 bg-black/40 text-sm text-cyan-100/60">
                    {coachLoadingAnalysis ? 'Analyse Stockfish en cours...' : 'En attente du lancement de l’analyse.'}
                  </div>
                )}
                <div className="rounded-2xl border border-cyan-400/20 bg-black/40 p-4">
                  <p className="mb-3 text-xs uppercase tracking-[0.3em] text-cyan-100/70">Moments clés</p>
                  {coachKeyMoments.length > 0 ? (
                    <KeyMoments items={coachKeyMoments} onReplay={handleCoachReplay} />
                  ) : (
                    <p className="text-sm text-cyan-100/70">
                      {coachLoadingAnalysis ? 'Identification des moments critiques...' : 'Lance une nouvelle analyse pour voir les moments clés.'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border border-fuchsia-400/30 bg-black/50 shadow-[0_0_35px_rgba(147,51,234,0.25)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
                <CardTitle className="text-lg font-semibold text-white">Commentaire du coach</CardTitle>
                <MessageSquareText className="h-5 w-5 text-fuchsia-300" />
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-0">
                <div className="grid grid-cols-2 gap-3 text-xs text-cyan-100/70">
                  <div className="rounded-2xl border border-cyan-400/30 bg-black/40 p-3 text-center">
                    <p className="uppercase tracking-[0.3em] text-[0.6rem] text-cyan-100/70">Précision blancs</p>
                    <p className="text-lg font-semibold text-white">{coachAccuracyWhite !== null ? `${coachAccuracyWhite}%` : '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/30 bg-black/40 p-3 text-center">
                    <p className="uppercase tracking-[0.3em] text-[0.6rem] text-cyan-100/70">Précision noirs</p>
                    <p className="text-lg font-semibold text-white">{coachAccuracyBlack !== null ? `${coachAccuracyBlack}%` : '—'}</p>
                  </div>
                </div>
                {coachSummary && (
                  <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-4 text-sm text-fuchsia-100/80">
                    {coachSummary}
                  </div>
                )}
                <div className="rounded-2xl border border-fuchsia-400/20 bg-black/40 p-4 text-sm text-cyan-100/80">
                  <CoachPanel comment={activeCoachComment} />
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(59,130,246,0.25)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Score global</CardTitle>
              <Gamepad2 className="h-5 w-5 text-cyan-300" />
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-0">
              <div className="flex items-end justify-between rounded-2xl border border-cyan-400/20 bg-black/60 p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/70">Note de la partie</p>
                  <p className="text-sm text-cyan-100/80">Synthèse des quatre axes de progression.</p>
                </div>
                <span className="text-4xl font-bold text-white">{overallScore} / 100</span>
              </div>
              <div className="grid gap-3">
                {scoreBreakdown.map(score => (
                  <div key={score.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-cyan-100/70">
                      <span>{score.label}</span>
                      <span>{score.value.toFixed(1)} / 10</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400"
                        style={{ width: `${Math.min(100, (score.value / 10) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-cyan-100/60">Garde ce score en mémoire et tente de battre ton record à la prochaine partie.</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(147,51,234,0.25)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Progression récente</CardTitle>
              <Award className="h-5 w-5 text-fuchsia-300" />
            </CardHeader>
            <CardContent className="space-y-3 p-6 pt-0">
              {progressData.length > 0 ? (
                <>
                  <p className="text-sm text-fuchsia-100/80">
                    Tu gagnes en précision à chaque analyse :
                    {latestImprovement >= 0 ? ` +${latestImprovement}%` : ` ${latestImprovement}%`} depuis la dernière partie.
                  </p>
                  <ChartContainer config={{ value: { label: 'Précision', color: 'hsl(276 92% 65%)' } }} className="h-48">
                    <AreaChart data={progressData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(192,132,252,0.2)" />
                      <XAxis dataKey="label" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                      <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="rgba(192,132,252,0.25)" strokeWidth={3} />
                      <ChartTooltip content={<ChartTooltipContent />} cursor={{ stroke: 'rgba(192,132,252,0.35)', strokeWidth: 1 }} />
                    </AreaChart>
                  </ChartContainer>
                </>
              ) : (
                <p className="text-sm text-fuchsia-100/70">Joue quelques parties pour débloquer la courbe de progression.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-cyan-500/25 bg-black/50 p-6 text-center md:flex-row">
          <div className="max-w-2xl text-left md:text-left">
            <h3 className="text-lg font-semibold text-white">Recommandations personnalisées</h3>
            <div className="mt-2 space-y-1 text-sm text-cyan-100/70">
              {selectedGame?.analysis_overview.recommendations.map((recommendation, index) => (
                <p key={index}>• {recommendation}</p>
              ))}
              {(!selectedGame || selectedGame.analysis_overview.recommendations.length === 0) && (
                <p>Aucune recommandation spécifique pour l’instant. Jouez une partie pour enrichir votre analyse.</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="rounded-xl border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10" disabled>
              Exporter en PDF (bientôt)
            </Button>
            <Button className="rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-6 text-black shadow-[0_0_25px_rgba(34,211,238,0.35)]" disabled>
              Revue guidée (bientôt)
            </Button>
          </div>
        </footer>

        {!user && (
          <Card className="rounded-3xl border border-cyan-400/20 bg-black/50 p-6 text-center text-sm text-cyan-100/70">
            Connectez-vous pour enregistrer vos parties et activer l’analyse détaillée.
          </Card>
        )}

        {loading && (
          <Card className="rounded-3xl border border-cyan-400/20 bg-black/50 p-6 text-center text-sm text-cyan-100/70">
            Chargement des parties en cours…
          </Card>
        )}

        {error && (
          <Card className="rounded-3xl border border-rose-400/40 bg-rose-500/10 p-6 text-center text-sm text-rose-100">
            {error}
          </Card>
        )}
      </div>
    </div>
  );
};

export default MatchAnalysis;
