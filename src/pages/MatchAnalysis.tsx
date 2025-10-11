import { useEffect, useMemo, useState } from 'react';
import {
  Bolt,
  ChartBar,
  ChartLine,
  Clock,
  Compass,
  Crosshair,
  Flame,
  MessageSquareText,
  Target,
  ChevronLeft,
  ChevronRight,
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
  const statsData = selectedGame?.analysis_overview.pieceStats ?? [];
  const keyMoments = selectedGame?.analysis_overview.keyMoments ?? [];
  const mistakeHistogram = selectedGame?.analysis_overview.mistakeHistogram ?? {
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
    best: 0,
  };

  const blunderData = [
    { phase: 'Grosses erreurs', value: mistakeHistogram.blunders },
    { phase: 'Erreurs', value: mistakeHistogram.mistakes },
  ];

  const mistakeData = [
    { phase: 'Inexactitudes', value: mistakeHistogram.inaccuracies },
    { phase: 'Coups solides', value: mistakeHistogram.best },
  ];

  const totalMoves = selectedGame?.move_history.length ?? 0;
  const accuracy = selectedGame?.accuracy ?? 0;

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
            <CardContent className="p-6 pt-0">
              <ChartContainer config={{ score: { label: 'Évaluation', color: 'hsl(183 97% 58%)' } }} className="h-48">
                <LineChart data={evaluationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.2)" />
                  <XAxis dataKey="move" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Line type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={3} dot={false} />
                  <ChartTooltip cursor={{ stroke: 'rgba(34,211,238,0.4)', strokeWidth: 1 }} content={<ChartTooltipContent />} />
                </LineChart>
              </ChartContainer>
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
            <CardContent className="p-6 pt-0">
              <ChartContainer config={{ value: { label: 'Avantage', color: 'hsl(49 100% 64%)' } }} className="h-48">
                <AreaChart data={imbalanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,204,21,0.2)" />
                  <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="rgba(250,204,21,0.25)" strokeWidth={3} />
                  <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Erreurs critiques</CardTitle>
              <Flame className="h-5 w-5 text-orange-300" />
            </CardHeader>
            <CardContent className="grid gap-6 p-6 pt-0 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Grosses erreurs</h3>
                <ChartContainer config={{ value: { label: 'Blunders', color: 'hsl(7 88% 55%)' } }} className="h-44">
                  <BarChart data={blunderData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(248,113,113,0.2)" vertical={false} />
                    <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                    <Bar dataKey="value" radius={10} fill="var(--color-value)" />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(248,113,113,0.12)' }} />
                  </BarChart>
                </ChartContainer>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Inexactitudes</h3>
                <ChartContainer config={{ value: { label: 'Mistakes', color: 'hsl(276 92% 65%)' } }} className="h-44">
                  <BarChart data={mistakeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(192,132,252,0.2)" vertical={false} />
                    <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                    <Bar dataKey="value" radius={10} fill="var(--color-value)" />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(192,132,252,0.12)' }} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Statistiques matériaux</CardTitle>
              <Target className="h-5 w-5 text-cyan-300" />
            </CardHeader>
            <CardContent className="grid gap-4 p-6 pt-0">
              {statsData.map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                  <span className="text-sm font-semibold text-white">{item.label}</span>
                  <div className="flex items-center gap-3 text-xs text-cyan-100/70">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-300" /> Blancs : {item.white}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Noirs : {item.black}
                    </span>
                  </div>
                </div>
              ))}
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
