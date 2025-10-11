import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Bot, Loader2, Menu, MessageSquareText, Rocket, RotateCcw, Send, Sparkles, User, Volume2, VolumeX } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import { GameState, Position, ChessPiece, ChessRule, PieceColor, ChessMove } from '@/types/chess';
import { allPresetRules } from '@/lib/presetRules';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { analyzeRuleLogic } from '@/lib/ruleValidation';
import { getCategoryColor } from '@/lib/ruleCategories';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseFunctionErrorMessage } from '@/integrations/supabase/errors';
import { buildCoachFallbackMessage } from '@/lib/coachFallback';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CoachChatMessage, CoachChatResponse } from '@/types/coach';
import { TIME_CONTROL_SETTINGS, type TimeControlOption, isTimeControlOption } from '@/types/timeControl';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import {
  analyzeCompletedGame,
  deserializeBoardState,
  formatMoveNotation,
  serializeBoardState,
} from '@/lib/postGameAnalysis';
import { saveCompletedGame } from '@/lib/gameStorage';

const createChatMessageId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const createWelcomeMessage = (): CoachChatMessage => ({
  id: createChatMessageId(),
  role: 'system',
  content: "Le coach conversationnel est prêt. Jouez un coup ou posez une question pour lancer l'analyse.",
  createdAt: new Date().toISOString(),
  trigger: 'initial',
});

const isCarnivorousPlantRule = (rule: ChessRule): boolean => {
  const id = rule.ruleId.toLowerCase();
  const name = rule.ruleName.toLowerCase();
  const normalizedId = id.replace(/[^a-z0-9]/g, '');
  const normalizedName = name.replace(/[^a-z0-9]/g, '');
  return (
    (normalizedId.includes('plante') && normalizedId.includes('carniv')) ||
    (normalizedName.includes('plante') && normalizedName.includes('carniv'))
  );
};

// --- constantes stables hors composant ---
const FILES = 'abcdefgh';

const AI_COLOR: PieceColor = 'black';
const HUMAN_COLOR: PieceColor = 'white';
const PIECE_WEIGHTS: Record<ChessPiece['type'], number> = {
  king: 20000,
  queen: 900,
  rook: 500,
  bishop: 330,
  knight: 320,
  pawn: 100
};

const AI_MOVE_DELAY_RANGES: Record<TimeControlOption, { min: number; max: number }> = {
  bullet: { min: 500, max: 3000 },
  blitz: { min: 2000, max: 5000 },
  long: { min: 1000, max: 10000 },
  untimed: { min: 1000, max: 10000 },
};

type AIDifficulty = 'novice' | 'standard' | 'expert';

const AI_DIFFICULTY_LEVELS: Record<
  AIDifficulty,
  { depth: number; label: string; description: string; selectionRange: number }
> = {
  novice: {
    depth: 1,
    label: 'Débutant',
    description: 'Vision limitée et choix parfois aventureux pour un entraînement détendu.',
    selectionRange: 3
  },
  standard: {
    depth: 2,
    label: 'Intermédiaire',
    description: 'Équilibre entre temps de réflexion et précision stratégique.',
    selectionRange: 2
  },
  expert: {
    depth: 3,
    label: 'Maître',
    description: 'Recherche profonde et coups optimisés pour un vrai défi.',
    selectionRange: 1
  }
};

const isAIDifficulty = (value: string): value is AIDifficulty => value in AI_DIFFICULTY_LEVELS;

type AiMoveResolver = (state: GameState) => { from: Position; to: Position } | null;

const CAPTURED_PIECE_SYMBOLS: Record<ChessPiece['type'], { white: string; black: string }> = {
  king: { white: '♔', black: '♚' },
  queen: { white: '♕', black: '♛' },
  rook: { white: '♖', black: '♜' },
  bishop: { white: '♗', black: '♝' },
  knight: { white: '♘', black: '♞' },
  pawn: { white: '♙', black: '♟' }
};

const ABILITY_LABELS: Record<string, string> = {
  missile: 'Tir de missile',
  missileStrike: 'Tir de missile',
  teleport: 'Téléportation',
  jump: 'Saut offensif',
  straightMove: 'Percée en ligne',
  diagonalMove: 'Percée diagonale',
  lateralMove: 'Percée latérale',
};

const Play = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const locationState = location.state as {
    customRules?: ChessRule[];
    presetRuleIds?: string[];
    opponentType?: 'ai' | 'player' | 'local';
    lobbyId?: string;
    role?: 'creator' | 'opponent';
    lobbyName?: string;
    opponentName?: string;
    playerName?: string;
    timeControl?: TimeControlOption;
    playerElo?: number;
    opponentElo?: number;
  } | undefined;

  const opponentType = locationState?.opponentType === 'player'
    ? 'player'
    : locationState?.opponentType === 'local'
      ? 'local'
      : 'ai';
  const lobbyId = typeof locationState?.lobbyId === 'string' ? locationState.lobbyId : undefined;
  const lobbyRole = locationState?.role === 'creator' || locationState?.role === 'opponent' ? locationState.role : undefined;
  const lobbyName = typeof locationState?.lobbyName === 'string' ? locationState.lobbyName : undefined;
  const opponentName = typeof locationState?.opponentName === 'string' ? locationState.opponentName : undefined;
  const playerName = typeof locationState?.playerName === 'string' ? locationState.playerName : undefined;

  const playerDisplayName = playerName ?? 'Vous';
  const opponentDisplayName = opponentName
    ?? (opponentType === 'ai' ? 'Cyber IA' : opponentType === 'local' ? 'Joueur local' : 'Adversaire inconnu');

  const playerElo = typeof locationState?.playerElo === 'number' ? locationState.playerElo : 1500;
  const opponentElo = typeof locationState?.opponentElo === 'number'
    ? locationState.opponentElo
    : opponentType === 'ai'
      ? 1800
      : 1500;

  const timeControl: TimeControlOption = isTimeControlOption(locationState?.timeControl)
    ? locationState.timeControl
    : 'untimed';
  const timeControlSettings = TIME_CONTROL_SETTINGS[timeControl];
  const initialTimeSeconds = timeControlSettings.initialSeconds;

  const { toast } = useToast();

  const rawCustomRules = useMemo(() => {
    const custom = locationState?.customRules;
    return Array.isArray(custom) ? (custom as ChessRule[]) : ([] as ChessRule[]);
  }, [locationState]);

  const initialPresetRuleIds = useMemo(() => {
    const preset = locationState?.presetRuleIds;
    if (!Array.isArray(preset)) return [] as string[];
    return preset.filter((ruleId): ruleId is string => typeof ruleId === 'string' && ruleId.length > 0);
  }, [locationState]);

  const analyzedCustomRules = useMemo(() => rawCustomRules.map(rule => analyzeRuleLogic(rule).rule), [rawCustomRules]);

  const [customRules, setCustomRules] = useState<ChessRule[]>(analyzedCustomRules);
  const activePresetRule = useMemo(() => {
    if (initialPresetRuleIds.length === 0) return null;
    const [firstRuleId] = initialPresetRuleIds;
    return allPresetRules.find(rule => rule.ruleId === firstRuleId) ?? null;
  }, [initialPresetRuleIds]);
  const appliedPresetRuleIds = useMemo(() => new Set(initialPresetRuleIds), [initialPresetRuleIds]);

  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('ai-difficulty');
      if (stored && isAIDifficulty(stored)) {
        return stored;
      }
    }
    return 'standard';
  });

  const aiDifficultyMeta = AI_DIFFICULTY_LEVELS[aiDifficulty];
  const aiSearchDepth = Math.max(1, aiDifficultyMeta.depth);

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [coachEnabled, setCoachEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const selectionTimestampRef = useRef<number | null>(null);
  const gameSavedRef = useRef(false);
  const gameStartTimeRef = useRef<number>(Date.now());

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
  const initialBoardSnapshotRef = useRef(serializeBoardState(gameState.board));
  const [timeRemaining, setTimeRemaining] = useState(() => ({
    white: initialTimeSeconds,
    black: initialTimeSeconds,
  }));

  const capturedPiecesByColor = useMemo(() => {
    const grouped: Record<PieceColor, ChessPiece[]> = { white: [], black: [] };
    for (const piece of gameState.capturedPieces) {
      grouped[piece.color].push(piece);
    }

    return {
      white: [...grouped.white].sort((a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type]),
      black: [...grouped.black].sort((a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type])
    };
  }, [gameState.capturedPieces]);

  const specialAbility = useMemo(() => {
    for (const rule of gameState.activeRules) {
      const abilityEffect = rule.effects.find(effect => effect.action === 'addAbility' && typeof effect.parameters?.ability === 'string');
      if (abilityEffect && typeof abilityEffect.parameters?.ability === 'string') {
        return {
          ruleName: rule.ruleName,
          ability: abilityEffect.parameters.ability as string,
        };
      }
    }
    return null;
  }, [gameState.activeRules]);

  const specialAbilityLabel = specialAbility ? ABILITY_LABELS[specialAbility.ability] ?? specialAbility.ability : '';

  const handleSpecialAction = useCallback(() => {
    if (!specialAbility) return;

    const title = specialAbilityLabel ? `${specialAbilityLabel} déclenchée` : 'Attaque spéciale déclenchée';
    const description = specialAbilityLabel
      ? `La capacité « ${specialAbilityLabel} » issue de la règle ${specialAbility.ruleName} est activée.`
      : `La règle ${specialAbility.ruleName} propose une action spéciale.`;

    toast({ title, description });
  }, [specialAbility, specialAbilityLabel, toast]);

  const whiteCapturedPieces = capturedPiecesByColor.black;
  const blackCapturedPieces = capturedPiecesByColor.white;

  const [coachMessages, setCoachMessages] = useState<CoachChatMessage[]>(() => [createWelcomeMessage()]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (gameState.moveHistory.length === 0) {
      initialBoardSnapshotRef.current = serializeBoardState(gameState.board);
      gameStartTimeRef.current = Date.now();
      gameSavedRef.current = false;
    }
  }, [gameState.board, gameState.moveHistory.length]);

  // --- refs utilitaires ---
  const latestGameStateRef = useRef<GameState>(gameState);
  const lastDiscussedMoveRef = useRef<number | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const initialAnalysisRef = useRef(false);
  const mountedRef = useRef(true);
  const aiMoveTimeoutRef = useRef<number | null>(null);
  const findBestAIMoveRef = useRef<AiMoveResolver | null>(null);
  const coachMessagesRef = useRef<CoachChatMessage[]>(coachMessages);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const activePlayerRef = useRef<PieceColor>(gameState.currentPlayer);
  const timeWarningPlayedRef = useRef<Record<PieceColor, boolean>>({ white: false, black: false });
  const timeExpiredHandledRef = useRef<Record<PieceColor, boolean>>({ white: false, black: false });

  const { playSound } = useSoundEffects();

  useEffect(() => {
    coachMessagesRef.current = coachMessages;
  }, [coachMessages]);

  useEffect(() => {
    if (timeControl === 'untimed') {
      lastTickRef.current = null;
      return;
    }
    if (!['active', 'check'].includes(gameState.gameStatus)) {
      lastTickRef.current = null;
    }
  }, [gameState.gameStatus, timeControl]);

  useEffect(() => {
    if (timeControl === 'untimed') return;
    if (!['active', 'check'].includes(gameState.gameStatus)) return;
    lastTickRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, [gameState.currentPlayer, gameState.gameStatus, timeControl]);

  useEffect(() => {
    if (timeControl === 'untimed') {
      return;
    }
    if (!['active', 'check'].includes(gameState.gameStatus)) {
      return;
    }

    if (lastTickRef.current === null) {
      lastTickRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    const interval = window.setInterval(() => {
      const lastTick = lastTickRef.current;
      if (lastTick === null) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedSeconds = (now - lastTick) / 1000;
      lastTickRef.current = now;

      setTimeRemaining(prev => {
        const activeColor = activePlayerRef.current;
        const currentValue = prev[activeColor];
        if (currentValue <= 0) {
          return prev;
        }

        const nextValue = Math.max(0, currentValue - elapsedSeconds);
        if (nextValue === currentValue) {
          return prev;
        }

        return { ...prev, [activeColor]: nextValue };
      });
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [gameState.gameStatus, timeControl]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ai-difficulty', aiDifficulty);
    }
  }, [aiDifficulty]);

  useEffect(() => { latestGameStateRef.current = gameState; }, [gameState]);
  useEffect(() => {
    activePlayerRef.current = gameState.currentPlayer;
  }, [gameState.currentPlayer]);
  useEffect(() => {
    setTimeRemaining({ white: initialTimeSeconds, black: initialTimeSeconds });
    lastTickRef.current = null;
  }, [initialTimeSeconds]);
  useEffect(() => {
    timeWarningPlayedRef.current = { white: false, black: false };
    timeExpiredHandledRef.current = { white: false, black: false };
  }, [initialTimeSeconds, timeControl]);
  useEffect(() => () => {
    mountedRef.current = false;
    inFlightRef.current?.abort();
    if (aiMoveTimeoutRef.current) {
      clearTimeout(aiMoveTimeoutRef.current);
      aiMoveTimeoutRef.current = null;
    }
  }, []);

  // --- sérialisation pour l'IA ---
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
    const file = FILES[position.col] ?? '?';
    const rank = 8 - position.row;
    return `${file}${rank}`;
  }, []);

  const formatClock = useCallback((seconds: number) => {
    if (timeControl === 'untimed') {
      return '∞';
    }

    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60);

    if (safeSeconds < 60) {
      const tenths = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 10);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${tenths}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, [timeControl]);

  // NOTE: capture au bon endroit (e2xe4), promotion après (=Q)
  const formatMoveForAi = useCallback((move: ChessMove) => {
    const sep = move.captured ? 'x' : '-';
    const promo = move.promotion ? `=${String(move.promotion).toUpperCase()}` : '';
    const special = move.isCastling ? ' (roque)' : move.isEnPassant ? ' (prise en passant)' : '';
    return `${positionToNotation(move.from)}${sep}${positionToNotation(move.to)}${promo}${special}`;
  }, [positionToNotation]);

  const requestCoachUpdate = useCallback(
    async (trigger: 'initial' | 'auto' | 'manual', userMessage: string) => {
      if (!coachEnabled) return;

      inFlightRef.current?.abort();
      const ac = new AbortController();
      inFlightRef.current = ac;

      const currentState = latestGameStateRef.current;
      const board = serializeBoardForAi(currentState.board);
      const moveHistory = currentState.moveHistory.map(formatMoveForAi);
      const activeRules = currentState.activeRules.map(rule => `${rule.ruleName}: ${rule.description}`);
      const moveCount = currentState.moveHistory.length;

      const history = coachMessagesRef.current
        .filter(message => message.role !== 'system')
        .slice(-8)
        .map(message => ({
          role: message.role === 'coach' ? 'assistant' : 'user',
          content: message.content,
        }));

      setCoachLoading(true);
      setCoachError(null);

      try {
        const { data, error } = await supabase.functions.invoke<CoachChatResponse>('chess-insights', {
          body: {
            board,
            moveHistory,
            currentPlayer: currentState.currentPlayer,
            turnNumber: currentState.turnNumber,
            gameStatus: currentState.gameStatus,
            activeRules,
            trigger,
            userMessage,
            history,
          },
          signal: ac.signal,
        });

        if (ac.signal.aborted) return;

        if (error) throw new Error(error.message ?? 'Erreur lors de la réponse du coach');

        const content = data?.message?.trim();
        if (!content) throw new Error('Réponse vide du coach');

        if (!mountedRef.current) return;

        const coachMessage: CoachChatMessage = {
          id: createChatMessageId(),
          role: 'coach',
          content,
          createdAt: new Date().toISOString(),
          trigger,
        };

        setCoachMessages(prev => [...prev, coachMessage]);
        lastDiscussedMoveRef.current = moveCount;
        setCoachError(null);
      } catch (err) {
        if (ac.signal.aborted) return;
        const message = getSupabaseFunctionErrorMessage(err, 'Le coach IA est indisponible pour le moment');
        if (!mountedRef.current) return;
        setCoachError(message);
        toast({ title: 'Coach IA indisponible', description: message, variant: 'destructive' });

        const fallbackContent = buildCoachFallbackMessage({
          board,
          moveHistory,
          currentPlayer: currentState.currentPlayer,
          turnNumber: currentState.turnNumber,
          gameStatus: currentState.gameStatus,
          trigger,
          reason: message,
        });

        const coachMessage: CoachChatMessage = {
          id: createChatMessageId(),
          role: 'coach',
          content: fallbackContent,
          createdAt: new Date().toISOString(),
          trigger,
        };

        setCoachMessages(prev => [...prev, coachMessage]);
        lastDiscussedMoveRef.current = moveCount;
      } finally {
        if (mountedRef.current) {
          setCoachLoading(false);
        }
      }
    },
    [coachEnabled, formatMoveForAi, serializeBoardForAi, toast]
  );

  useEffect(() => {
    const container = chatContainerRef.current;
    if (container && coachMessages.length > 0) {
      // Scroll vers le bas pour afficher les deux derniers messages
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [coachMessages]);

  useEffect(() => {
    if (!coachEnabled) {
      inFlightRef.current?.abort();
      setCoachLoading(false);
      setCoachError(null);
      initialAnalysisRef.current = false;
    }
  }, [coachEnabled]);

  const handleManualRefresh = useCallback(() => {
    if (!coachEnabled) {
      toast({ title: 'Coach IA désactivé', description: 'Activez le coach pour relancer une analyse.' });
      return;
    }

    requestCoachUpdate(
      'manual',
      "Peux-tu analyser la position actuelle et me rappeler le plan prioritaire ?"
    );
  }, [coachEnabled, requestCoachUpdate, toast]);

  const handleSendChatMessage = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const newMessage: CoachChatMessage = {
      id: createChatMessageId(),
      role: 'player',
      content: trimmed,
      createdAt: new Date().toISOString(),
      trigger: 'manual',
    };

    if (!coachEnabled) {
      toast({ title: 'Coach IA désactivé', description: 'Réactivez le coach pour envoyer un message.' });
      return;
    }

    setCoachMessages(prev => [...prev, newMessage]);
    setChatInput('');
    requestCoachUpdate('manual', trimmed);
  }, [chatInput, coachEnabled, requestCoachUpdate, toast]);

  // déclenchement initial + auto sur nouveaux coups
  useEffect(() => {
    if (!coachEnabled) return;

    if (!initialAnalysisRef.current) {
      initialAnalysisRef.current = true;
      requestCoachUpdate(
        'initial',
        "Analyse la position actuelle, décris les coups joués et donne des conseils pour le camp au trait."
      );
      return;
    }

    const len = gameState.moveHistory.length;
    if (len !== lastDiscussedMoveRef.current) {
      const state = latestGameStateRef.current;
      const lastMove = state.moveHistory[state.moveHistory.length - 1];
      const autoPrompt = lastMove
        ? `Nous venons de jouer ${formatMoveForAi(lastMove)}. Analyse la position et propose un plan pour ${state.currentPlayer}.`
        : "Analyse la position actuelle et propose un plan.";
      requestCoachUpdate('auto', autoPrompt);
    }
  }, [coachEnabled, gameState.moveHistory.length, formatMoveForAi, requestCoachUpdate]);

  useEffect(() => { setCustomRules(analyzedCustomRules); }, [analyzedCustomRules]);

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
        nextBoard = prev.board.map(row => row.map(piece => (piece ? { ...piece, isHidden: false } : null)));
      }

      const positionHistory = { ...prev.positionHistory };
      const signature = ChessEngine.getBoardSignature(nextBoard);
      if (!positionHistory[signature]) positionHistory[signature] = 1;

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

  const respawnPawn = useCallback((board: (ChessPiece | null)[][], color: PieceColor): boolean => {
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
  }, []);

  const applyMoveToState = useCallback((state: GameState, selectedPiece: ChessPiece, destination: Position, selectionDuration: number | null): GameState => {
    const activeRuleIds = new Set(state.activeRules.filter(rule => rule.isActive).map(rule => rule.ruleId));
    const hasRule = (ruleId: string) => activeRuleIds.has(ruleId);

    const move = ChessEngine.createMove(state.board, selectedPiece, destination, state);
    move.timestamp = new Date().toISOString();
    move.durationMs = typeof selectionDuration === 'number' ? selectionDuration : null;
    const events: string[] = [];

    let pendingTransformations = { ...state.pendingTransformations };
    if (hasRule('preset_vip_magnus_06') && pendingTransformations[state.currentPlayer] && selectedPiece.type === 'pawn') {
      move.promotion = move.promotion ?? 'knight';
      pendingTransformations = { ...pendingTransformations, [state.currentPlayer]: false };
    }

    const newBoard = ChessEngine.executeMove(state.board, move, state);

    const carnivorousPlantActive = state.activeRules.some(rule => rule.isActive && isCarnivorousPlantRule(rule));
    const plantCapturedPieces: ChessPiece[] = [];

    if (carnivorousPlantActive) {
      const movedPieceAfterMove = ChessEngine.getPieceAt(newBoard, move.to);

      if (
        selectedPiece.type === 'pawn' &&
        movedPieceAfterMove &&
        movedPieceAfterMove.color === state.currentPlayer &&
        !movedPieceAfterMove.specialState?.carnivorousPlant?.active
      ) {
        const targetRow = movedPieceAfterMove.color === 'white' ? 1 : 6;
        if (movedPieceAfterMove.position.row === targetRow) {
          const transformedPiece: ChessPiece = {
            ...movedPieceAfterMove,
            specialState: {
              ...(movedPieceAfterMove.specialState ?? {}),
              carnivorousPlant: {
                active: true,
                transformedAtTurn: state.turnNumber + 1,
              },
            },
          };
          newBoard[targetRow][movedPieceAfterMove.position.col] = transformedPiece;
        }
      }

      const survivorAfterPlantCheck = ChessEngine.getPieceAt(newBoard, move.to);
      if (survivorAfterPlantCheck) {
        const hostilePlants: ChessPiece[] = [];
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const candidate = newBoard[row][col];
            if (candidate?.specialState?.carnivorousPlant?.active) {
              hostilePlants.push(candidate);
            }
          }
        }

        for (const plant of hostilePlants) {
          if (plant.color === survivorAfterPlantCheck.color) continue;
          const dRow = Math.abs(plant.position.row - survivorAfterPlantCheck.position.row);
          const dCol = Math.abs(plant.position.col - survivorAfterPlantCheck.position.col);
          if ((dRow !== 0 || dCol !== 0) && dRow <= 1 && dCol <= 1) {
            const victim: ChessPiece = { ...survivorAfterPlantCheck };
            plantCapturedPieces.push(victim);
            newBoard[survivorAfterPlantCheck.position.row][survivorAfterPlantCheck.position.col] = null;
            if (!move.specialCaptures) {
              move.specialCaptures = [];
            }
            move.specialCaptures.push({
              type: 'carnivorousPlant',
              by: { ...plant.position },
              piece: victim,
            });
            break;
          }
        }
      }
    }

    const updatedHistory = [...state.moveHistory, move];
    let updatedCaptured = [...state.capturedPieces];
    if (move.captured) {
      updatedCaptured = [...updatedCaptured, move.captured];
    }
    if (plantCapturedPieces.length > 0) {
      updatedCaptured = [...updatedCaptured, ...plantCapturedPieces];
    }

    const survivingPieceAfterMove = ChessEngine.getPieceAt(newBoard, move.to);

    let forcedMirror = state.forcedMirrorResponse;
    if (forcedMirror && forcedMirror.color === state.currentPlayer && selectedPiece.type === 'pawn' && selectedPiece.position.col === forcedMirror.file) {
      forcedMirror = null;
    }

    const opponentColor: PieceColor = state.currentPlayer === 'white' ? 'black' : 'white';

    if (hasRule('preset_vip_magnus_02') && selectedPiece.type === 'pawn') {
      const mirrorFile = 7 - move.to.col;
      const opponentHasPawn = newBoard.some(row =>
        row.some(piece => piece && piece.type === 'pawn' && piece.color === opponentColor && piece.position.col === mirrorFile)
      );
      if (opponentHasPawn) {
        forcedMirror = { color: opponentColor, file: mirrorFile };
      } else if (forcedMirror && forcedMirror.color === opponentColor) {
        forcedMirror = null;
      }
    }

    let pendingExtraMoves = { ...state.pendingExtraMoves };
    if (hasRule('preset_vip_magnus_03') && move.captured) {
      pendingExtraMoves = { ...pendingExtraMoves, [opponentColor]: (pendingExtraMoves[opponentColor] ?? 0) + 1 };
    }

    let freezeEffects = state.freezeEffects
      .map(effect => ({ ...effect }))
      .filter(effect => {
        const target = ChessEngine.getPieceAt(newBoard, effect.position);
        return target && target.color === effect.color && effect.remainingTurns > 0;
      });

    const freezeUsage = { ...state.freezeUsage };

    if (hasRule('preset_vip_magnus_09') && !freezeUsage[state.currentPlayer]) {
      const attackSquares = ChessEngine.getAttackSquares(newBoard, move.piece);
      const frozenTarget = attackSquares.map(pos => ChessEngine.getPieceAt(newBoard, pos)).find(piece => piece && piece.color === opponentColor);
      if (frozenTarget) {
        freezeEffects = [...freezeEffects, { color: opponentColor, position: { ...frozenTarget.position }, remainingTurns: 2 }];
        freezeUsage[state.currentPlayer] = true;
      }
    }

    let replayOpportunities = { ...state.replayOpportunities };
    if (replayOpportunities[state.currentPlayer]) {
      replayOpportunities = { ...replayOpportunities };
      delete replayOpportunities[state.currentPlayer];
    }

    let vipTokens = { ...state.vipTokens };

    if (hasRule('preset_vip_magnus_10') && move.captured?.type === 'pawn') {
      if (vipTokens[move.captured.color]) {
        const used = respawnPawn(newBoard, move.captured.color);
        if (used) vipTokens = { ...vipTokens, [move.captured.color]: vipTokens[move.captured.color] - 1 };
      }
    }

    const positionHistory = { ...state.positionHistory };
    const signature = ChessEngine.getBoardSignature(newBoard);
    positionHistory[signature] = (positionHistory[signature] ?? 0) + 1;

    if (hasRule('preset_vip_magnus_06') && positionHistory[signature] >= 3) {
      pendingTransformations = { ...pendingTransformations, [state.currentPlayer]: true };
    }

    let blindOpeningRevealed = state.blindOpeningRevealed ?? { white: false, black: false };
    if (hasRule('preset_vip_magnus_01') && selectedPiece.type === 'pawn' && !blindOpeningRevealed[selectedPiece.color]) {
      ChessEngine.revealBackRank(newBoard, selectedPiece.color);
      blindOpeningRevealed = { ...blindOpeningRevealed, [selectedPiece.color]: true };
    }

    const lastMoveByColor = { ...state.lastMoveByColor, [state.currentPlayer]: move };

    const evaluationState: GameState = {
      ...state,
      board: newBoard,
      currentPlayer: opponentColor,
      turnNumber: state.turnNumber + 1,
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
      secretSetupApplied: state.secretSetupApplied,
      blindOpeningRevealed
    };

    if (hasRule('preset_vip_magnus_10') && !move.captured && survivingPieceAfterMove) {
      if (ChessEngine.isSquareAttacked(newBoard, survivingPieceAfterMove.position, opponentColor, evaluationState)) {
        vipTokens = { ...vipTokens, [state.currentPlayer]: vipTokens[state.currentPlayer] + 1 };
      }
    }

    const opponentInCheck = ChessEngine.isInCheck(newBoard, opponentColor, evaluationState);
    const opponentHasMoves = ChessEngine.hasAnyLegalMoves(newBoard, opponentColor, evaluationState);

    if (hasRule('preset_vip_magnus_08') && opponentInCheck) {
      const opponentLast = state.lastMoveByColor[opponentColor];
      if (opponentLast) {
        replayOpportunities = { ...replayOpportunities, [opponentColor]: { from: opponentLast.from, to: opponentLast.to } };
        pendingExtraMoves = { ...pendingExtraMoves, [opponentColor]: (pendingExtraMoves[opponentColor] ?? 0) + 1 };
      }
    }

    const extraMovesEarned = ChessEngine.getExtraMovesForPiece(selectedPiece, state);
    const instinctBonus = hasRule('preset_vip_magnus_07') && selectionDuration !== null && selectionDuration <= 2000 && (move.captured || opponentInCheck) ? 1 : 0;

    const previousExtraMoves = state.extraMoves;
    const remainingAfterConsumption = previousExtraMoves > 0 ? previousExtraMoves - 1 : 0;
    const totalExtraMoves = remainingAfterConsumption + extraMovesEarned + instinctBonus;

    const opponentPending = pendingExtraMoves[opponentColor] ?? 0;
    const stayOnCurrentPlayer = totalExtraMoves > 0;
    const nextExtraMoves = stayOnCurrentPlayer ? totalExtraMoves : opponentPending;
    const updatedPendingExtraMoves = stayOnCurrentPlayer ? pendingExtraMoves : { ...pendingExtraMoves, [opponentColor]: 0 };

    let nextStatus: GameState['gameStatus'] = 'active';
    if (opponentInCheck && !opponentHasMoves) nextStatus = 'checkmate';
    else if (!opponentInCheck && !opponentHasMoves) nextStatus = 'stalemate';
    else if (opponentInCheck) nextStatus = 'check';

    const nextMovesThisTurn = stayOnCurrentPlayer ? state.movesThisTurn + 1 : 0;
    const nextTurnNumber = state.turnNumber + 1;
    const nextPlayer = stayOnCurrentPlayer ? state.currentPlayer : opponentColor;

    let finalFreezeEffects = freezeEffects;
    if (!stayOnCurrentPlayer) {
      finalFreezeEffects = freezeEffects
        .map(effect => (effect.color === opponentColor ? { ...effect, remainingTurns: effect.remainingTurns - 1 } : effect))
        .filter(effect => {
          const target = ChessEngine.getPieceAt(newBoard, effect.position);
          return effect.remainingTurns > 0 && target && target.color === effect.color;
        });
    }

    if (move.isCastling) {
      events.push('castle');
    } else if (move.isEnPassant) {
      events.push('en-passant');
    } else if (move.captured) {
      events.push('capture');
    } else {
      events.push('move');
    }

    if (nextStatus === 'checkmate') {
      events.push('checkmate');
    } else if (nextStatus === 'check') {
      events.push('check');
    }

    move.boardSnapshot = serializeBoardState(newBoard);
    move.notation = move.notation ?? formatMoveNotation(move);

    return {
      ...state,
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
      blindOpeningRevealed,
      events
    };
  }, [respawnPawn]);

  const evaluateState = useCallback((state: GameState) => {
    if (state.gameStatus === 'checkmate') {
      return state.currentPlayer === AI_COLOR ? -Infinity : Infinity;
    }
    if (state.gameStatus === 'stalemate' || state.gameStatus === 'draw') {
      return 0;
    }

    let materialScore = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row][col];
        if (!piece) continue;
        const value = PIECE_WEIGHTS[piece.type] ?? 0;
        materialScore += piece.color === AI_COLOR ? value : -value;
      }
    }

    if (state.gameStatus === 'check') {
      materialScore += state.currentPlayer === AI_COLOR ? -50 : 50;
    }

    return materialScore;
  }, []);

  const generateMoves = useCallback((state: GameState, color: PieceColor) => {
    const moves: Array<{ from: Position; to: Position; resultingState: GameState }> = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row][col];
        if (!piece || piece.color !== color) continue;
        if (piece.isHidden) continue;

        const stateForPiece: GameState = {
          ...state,
          currentPlayer: color,
          selectedPiece: piece,
          validMoves: []
        };

        const destinations = ChessEngine.getValidMoves(state.board, piece, stateForPiece);
        destinations.forEach(destination => {
          const from: Position = { row: piece.position.row, col: piece.position.col };
          const to: Position = { row: destination.row, col: destination.col };
          const resultingState = applyMoveToState(state, piece, to, null);
          moves.push({ from, to, resultingState });
        });
      }
    }

    return moves;
  }, [applyMoveToState]);

  const minimax = useCallback((state: GameState, depth: number, maximizingPlayer: boolean, alpha: number, beta: number): number => {
    if (depth === 0 || ['checkmate', 'stalemate', 'draw'].includes(state.gameStatus)) {
      return evaluateState(state);
    }

    const colorToMove = maximizingPlayer ? AI_COLOR : HUMAN_COLOR;
    const possibleMoves = generateMoves(state, colorToMove);

    if (possibleMoves.length === 0) {
      return evaluateState(state);
    }

    let newAlpha = alpha;
    let newBeta = beta;

    if (maximizingPlayer) {
      let bestValue = -Infinity;
      for (const move of possibleMoves) {
        const nextMaximizing = move.resultingState.currentPlayer === AI_COLOR;
        const value = minimax(move.resultingState, depth - 1, nextMaximizing, newAlpha, newBeta);
        bestValue = Math.max(bestValue, value);
        newAlpha = Math.max(newAlpha, bestValue);
        if (newBeta <= newAlpha) break;
      }
      return bestValue;
    }

    let bestValue = Infinity;
    for (const move of possibleMoves) {
      const nextMaximizing = move.resultingState.currentPlayer === AI_COLOR;
      const value = minimax(move.resultingState, depth - 1, nextMaximizing, newAlpha, newBeta);
      bestValue = Math.min(bestValue, value);
      newBeta = Math.min(newBeta, bestValue);
      if (newBeta <= newAlpha) break;
    }
    return bestValue;
  }, [evaluateState, generateMoves]);

  const findBestAIMove = useCallback((state: GameState) => {
    const candidates = generateMoves(state, AI_COLOR);
    if (candidates.length === 0) return null;

    const evaluatedMoves = candidates.map(candidate => {
      const nextMaximizing = candidate.resultingState.currentPlayer === AI_COLOR;
      const score = minimax(candidate.resultingState, aiSearchDepth - 1, nextMaximizing, -Infinity, Infinity);
      return { ...candidate, score };
    });

    evaluatedMoves.sort((a, b) => b.score - a.score);

    const selectionRange = AI_DIFFICULTY_LEVELS[aiDifficulty].selectionRange;
    const poolSize = Math.max(1, Math.min(evaluatedMoves.length, selectionRange));
    const chosenIndex = poolSize === 1 ? 0 : Math.floor(Math.random() * poolSize);
    const chosenMove = evaluatedMoves[chosenIndex];

    if (!chosenMove) {
      const random = candidates[Math.floor(Math.random() * candidates.length)];
      return { from: random.from, to: random.to };
    }

    return { from: chosenMove.from, to: chosenMove.to };
  }, [generateMoves, minimax, aiSearchDepth, aiDifficulty]);

  useEffect(() => {
    findBestAIMoveRef.current = findBestAIMove;
  }, [findBestAIMove]);

  useEffect(() => {
    const events = gameState.events ?? [];
    if (events.length === 0) return;

    const prioritized: Array<'checkmate' | 'check' | 'castle' | 'en-passant' | 'capture' | 'move'> = [
      'checkmate',
      'check',
      'castle',
      'en-passant',
      'capture',
      'move',
    ];

    prioritized.forEach(event => {
      if (events.includes(event) && soundEnabled) {
        void playSound(event);
      }
    });

    setGameState(prev => {
      if (!prev.events || prev.events.length === 0) return prev;
      return { ...prev, events: [] };
    });
  }, [gameState.events, playSound, soundEnabled]);

  useEffect(() => {
    if (timeControl === 'untimed') return;

    const baseThreshold = initialTimeSeconds > 0 ? initialTimeSeconds * 0.1 : 0;
    const threshold = Math.min(10, Math.max(3, baseThreshold));

    (['white', 'black'] as PieceColor[]).forEach(color => {
      const remaining = timeRemaining[color];

      if (remaining > 0 && remaining <= threshold && !timeWarningPlayedRef.current[color]) {
        timeWarningPlayedRef.current[color] = true;
        if (soundEnabled) {
          void playSound('time-warning');
        }
      }

      if (remaining <= 0 && !timeExpiredHandledRef.current[color]) {
        timeExpiredHandledRef.current[color] = true;
        if (soundEnabled) {
          void playSound('time-expired');
        }
        setGameState(prev => {
          if (prev.gameStatus === 'timeout') return prev;
          if (!['active', 'check'].includes(prev.gameStatus)) return prev;
          const losingColor = color;
          const winningColor: PieceColor = losingColor === 'white' ? 'black' : 'white';
          return {
            ...prev,
            currentPlayer: winningColor,
            gameStatus: 'timeout',
            extraMoves: 0,
            events: [],
          };
        });
      }
    });
  }, [timeRemaining, timeControl, initialTimeSeconds, playSound, soundEnabled]);

  useEffect(() => {
    if (!['checkmate', 'stalemate', 'draw', 'timeout'].includes(gameState.gameStatus)) return;
    if (gameState.moveHistory.length === 0) return;
    if (gameSavedRef.current) return;

    gameSavedRef.current = true;

    const status = gameState.gameStatus;
    const result: 'win' | 'loss' | 'draw' = status === 'checkmate'
      ? (gameState.currentPlayer === HUMAN_COLOR ? 'loss' : 'win')
      : status === 'timeout'
        ? (gameState.currentPlayer === HUMAN_COLOR ? 'win' : 'loss')
        : 'draw';

    const durationSeconds = gameStartTimeRef.current
      ? (Date.now() - gameStartTimeRef.current) / 1000
      : undefined;

    const initialBoardMatrix = deserializeBoardState(initialBoardSnapshotRef.current);

    const analysis = analyzeCompletedGame(gameState.moveHistory, {
      playerColor: HUMAN_COLOR,
      result,
      initialBoard: initialBoardMatrix,
    });

    const metadata = {
      variantName,
      opponentType,
      opponentName: opponentDisplayName,
      playerElo,
      opponentElo,
    };

    void (async () => {
      try {
        await saveCompletedGame({
          userId: user?.id ?? null,
          opponentName: opponentDisplayName,
          opponentType,
          result,
          variantName,
          timeControl,
          playerColor: HUMAN_COLOR,
          analysis,
          durationSeconds,
          metadata,
        });
        toast({
          title: 'Partie enregistrée',
          description: 'Analyse disponible dans l’onglet Analyse.',
        });
      } catch (error) {
        console.error('Failed to save completed game', error);
        toast({
          title: 'Sauvegarde impossible',
          description: "Impossible d’enregistrer la partie pour l’analyse.",
          variant: 'destructive',
        });
      }
    })();
  }, [
    gameState.gameStatus,
    gameState.currentPlayer,
    gameState.moveHistory,
    opponentDisplayName,
    opponentElo,
    opponentType,
    playerElo,
    timeControl,
    toast,
    user?.id,
    variantName,
  ]);

  const handlePieceClick = (piece: ChessPiece) => {
    if (['checkmate', 'stalemate', 'draw', 'timeout'].includes(gameState.gameStatus)) return;
    if (piece.color !== gameState.currentPlayer) return;
    if (piece.isHidden) return;

    const forcedMirror = gameState.forcedMirrorResponse;
    if (forcedMirror && forcedMirror.color === piece.color) {
      if (piece.type !== 'pawn' || piece.position.col !== forcedMirror.file) return;
    }

    const frozen = gameState.freezeEffects.some(effect =>
      effect.color === piece.color &&
      effect.position.row === piece.position.row &&
      effect.position.col === piece.position.col &&
      effect.remainingTurns > 0
    );
    if (frozen) return;

    let validMoves = ChessEngine.getValidMoves(gameState.board, piece, gameState);

    const replayOpportunity = gameState.replayOpportunities[piece.color];
    if (replayOpportunity &&
      piece.position.row === replayOpportunity.to.row &&
      piece.position.col === replayOpportunity.to.col
    ) {
      const alreadyIncluded = validMoves.some(pos => pos.row === replayOpportunity.from.row && pos.col === replayOpportunity.from.col);
      if (!alreadyIncluded) validMoves = [...validMoves, replayOpportunity.from];
    }

    selectionTimestampRef.current = Date.now();

    setGameState(prev => ({ ...prev, selectedPiece: piece, validMoves }));
  };

  const handleSquareClick = (position: Position) => {
    if (['checkmate', 'stalemate', 'draw', 'timeout'].includes(gameState.gameStatus)) return;
    if (!gameState.selectedPiece) return;

    const selectedPiece = gameState.selectedPiece;
    const isValid = gameState.validMoves.some(move => move.row === position.row && move.col === position.col);
    if (!isValid) return;

    const selectionDuration = selectionTimestampRef.current ? Date.now() - selectionTimestampRef.current : null;
    selectionTimestampRef.current = null;

    const nextState = applyMoveToState(gameState, selectedPiece, position, selectionDuration);
    setGameState(nextState);
  };

  useEffect(() => {
    if (opponentType !== 'ai') {
      if (aiMoveTimeoutRef.current) {
        clearTimeout(aiMoveTimeoutRef.current);
        aiMoveTimeoutRef.current = null;
      }
      return;
    }

    if (['checkmate', 'stalemate', 'draw', 'timeout'].includes(gameState.gameStatus)) return;
    if (gameState.currentPlayer !== AI_COLOR) return;
    if (aiMoveTimeoutRef.current) return;

    const { min, max } = AI_MOVE_DELAY_RANGES[timeControl] ?? AI_MOVE_DELAY_RANGES.long;
    const delayMs = Math.random() * (max - min) + min;

    aiMoveTimeoutRef.current = window.setTimeout(() => {
      aiMoveTimeoutRef.current = null;
      const currentState = latestGameStateRef.current;
      if (currentState.currentPlayer !== AI_COLOR || ['checkmate', 'stalemate', 'draw', 'timeout'].includes(currentState.gameStatus)) {
        return;
      }

      const resolver = findBestAIMoveRef.current ?? findBestAIMove;
      const bestMove = resolver(currentState);
      if (!bestMove) return;

      setGameState(prev => {
        if (prev.currentPlayer !== AI_COLOR || ['checkmate', 'stalemate', 'draw', 'timeout'].includes(prev.gameStatus)) {
          return prev;
        }

        const piece = ChessEngine.getPieceAt(prev.board, bestMove.from);
        if (!piece || piece.color !== AI_COLOR || piece.isHidden) {
          return prev;
        }

        return applyMoveToState(prev, piece, bestMove.to, delayMs);
      });
    }, delayMs);
  }, [gameState.currentPlayer, gameState.gameStatus, opponentType, findBestAIMove, applyMoveToState, timeControl]);

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
    setTimeRemaining({ white: initialTimeSeconds, black: initialTimeSeconds });
    timeWarningPlayedRef.current = { white: false, black: false };
    timeExpiredHandledRef.current = { white: false, black: false };
    lastTickRef.current = null;
    // on permet une nouvelle analyse initiale
    initialAnalysisRef.current = false;
    lastDiscussedMoveRef.current = null;
    const systemMessage = createWelcomeMessage();
    setCoachMessages([systemMessage]);
    coachMessagesRef.current = [systemMessage];
    initialBoardSnapshotRef.current = serializeBoardState(initialBoard);
    gameStartTimeRef.current = Date.now();
    gameSavedRef.current = false;
  };

  const primaryRule = customRules[0] ?? activePresetRule ?? null;
  const variantName = primaryRule?.ruleName ?? 'Standard';
  const activeCustomRulesCount = customRules.length;

  const headerBadges = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge className="border-cyan-500/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-cyan-200">
        Mode : {opponentType === 'ai' ? 'IA' : opponentType === 'local' ? 'Local' : 'Multijoueur en ligne'}
      </Badge>
      <Badge className="border-cyan-400/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-cyan-200">
        Temps : {timeControl === 'untimed' ? 'Sans limite' : timeControlSettings.label}
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
  );

  const aiDifficultyControls = opponentType === 'ai' ? (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="flex items-center gap-3 rounded-full border border-cyan-400/40 bg-black/40 px-4 py-2">
        <span className="text-[0.6rem] uppercase tracking-[0.35em] text-cyan-200/80">Niveau IA</span>
        <Select value={aiDifficulty} onValueChange={value => setAiDifficulty(value as AIDifficulty)}>
          <SelectTrigger className="h-8 w-[170px] rounded-full border-cyan-400/40 bg-black/60 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-100 focus:ring-cyan-400">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent className="border-cyan-400/40 bg-black/80 text-cyan-100">
            {Object.entries(AI_DIFFICULTY_LEVELS).map(([value, meta]) => (
              <SelectItem
                key={value}
                value={value}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100 focus:bg-cyan-500/20 focus:text-white"
              >
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Badge className="border-cyan-400/40 bg-cyan-500/10 text-[0.6rem] uppercase tracking-[0.35em] text-cyan-100">
        Profondeur {aiSearchDepth}
      </Badge>
      <p className="max-w-xs text-right text-[0.7rem] text-cyan-200/70">{aiDifficultyMeta.description}</p>
    </div>
  ) : null;

  const ruleSummaryBar = (
    <div className="flex flex-wrap items-center justify-center gap-3 text-xs uppercase tracking-[0.2em] text-cyan-100/70">
      <span className="text-cyan-200/90">Règle active :</span>
      {primaryRule ? (
        <Badge className="border-cyan-400/60 bg-cyan-500/10 px-3 py-1 text-[0.7rem] font-semibold text-cyan-100">
          {primaryRule.ruleName}
        </Badge>
      ) : (
        <span className="rounded-full border border-cyan-400/40 bg-black/40 px-3 py-1 font-semibold text-cyan-100">Standard</span>
      )}
      {opponentType === 'player' && lobbyName && (
        <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">Lobby : {lobbyName}</Badge>
      )}
      {opponentType === 'player' && opponentName && (
        <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">Adversaire : {opponentName}</Badge>
      )}
      {opponentType === 'player' && lobbyId && (
        <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">ID : {lobbyId.slice(0, 8)}…</Badge>
      )}
      {playerName && (
        <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">Joueur : {playerName}</Badge>
      )}
    </div>
  );

  const customRulesBanner = activeCustomRulesCount > 0 ? (
    <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 px-6 py-4 text-center text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200 backdrop-blur">
      {activeCustomRulesCount} règle(s) personnalisée(s) synchronisée(s) depuis le lobby.
    </div>
  ) : null;

  const leftSidebarContent = (
    <div className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-black/50 p-6 shadow-[0_0_45px_-12px_rgba(56,189,248,0.65)] backdrop-blur-xl">
      <div className="pointer-events-none absolute -left-24 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 border border-cyan-300/10" />
      <div className="relative z-10 space-y-6">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.45em] text-cyan-200/80">Contrôle du temps</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {timeControl === 'untimed' ? 'Sans limite' : timeControlSettings.label}
          </p>
          {timeControl === 'untimed' ? (
            <p className="mt-3 text-xs text-cyan-100/70">{timeControlSettings.description}</p>
          ) : (
            <div className="mt-4 space-y-2 text-left">
              {(['white', 'black'] as PieceColor[]).map(color => {
                const isActive =
                  gameState.currentPlayer === color && ['active', 'check'].includes(gameState.gameStatus);
                return (
                  <div
                    key={color}
                    className={cn(
                      'flex items-center justify-between rounded-xl border border-cyan-300/20 px-3 py-2 text-sm text-cyan-100 transition-all',
                      isActive
                        ? 'bg-cyan-500/20 text-white shadow-[0_0_18px_rgba(34,211,238,0.45)]'
                        : 'bg-black/30'
                    )}
                  >
                    <span className="uppercase tracking-[0.3em]">
                      {color === 'white' ? 'Blancs' : 'Noirs'}
                    </span>
                    <span className="text-lg font-semibold">{formatClock(timeRemaining[color])}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {['Régénération', 'Analyse IA', 'Exécution dynamique', 'Mouvements spéciaux'].map((section, index) => (
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
    </div>
  );

  const boardSummaryContent = (
    <>
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
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Coach conversationnel</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Conseils en temps réel</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Le coach IA commente vos coups, suggère des plans et identifie les ouvertures. Retrouvez toutes les réponses dans le panneau de chat à droite.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleManualRefresh}
                disabled={coachLoading}
                className="flex items-center gap-2 rounded-full border-cyan-300/60 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 transition-all duration-200 hover:border-cyan-200 hover:bg-cyan-500/20 hover:text-white"
              >
                {coachLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {coachLoading ? 'Analyse…' : 'Actualiser'}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-white/60">
              L’analyse se relance automatiquement après chaque coup. Vous pouvez aussi envoyer vos propres questions.
            </p>
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
    </>
  );

  const coachSidebarContent = (
    <div className="relative overflow-hidden rounded-3xl border border-fuchsia-500/40 bg-black/40 p-6 shadow-[0_0_45px_-12px_rgba(236,72,153,0.65)] backdrop-blur-xl lg:flex lg:h-full lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 border border-fuchsia-300/10" />
      <div className="pointer-events-none absolute -right-20 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="relative z-10 flex h-full flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">Coach IA</p>
            <h2 className="mt-2 text-xl font-semibold text-fuchsia-100">Coach CyberIA</h2>
            <p className="mt-2 text-sm text-fuchsia-100/80">
              Discutez avec le coach pour obtenir des plans, des explications de coups et le nom des ouvertures.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleManualRefresh}
            disabled={coachLoading}
            className="flex items-center gap-2 rounded-full border-fuchsia-300/60 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-100 transition-all duration-200 hover:border-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-white"
          >
            {coachLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {coachLoading ? 'Analyse…' : 'Actualiser'}
          </Button>
        </div>

        <div
          ref={chatContainerRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-3xl border border-fuchsia-300/20 bg-black/40 p-4 scroll-smooth lg:max-h-[calc(100vh-18rem)]"
        >
          {coachMessages.map(message => {
            const isCoach = message.role === 'coach';
            const isPlayer = message.role === 'player';
            const bubbleClasses = cn(
              'w-full rounded-2xl border px-4 py-3 text-sm leading-relaxed',
              isCoach && 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100',
              isPlayer && 'ml-auto border-cyan-400/40 bg-cyan-500/10 text-cyan-100',
              message.role === 'system' && 'border-white/10 bg-white/5 text-white/70'
            );
            const label = message.role === 'coach' ? 'Coach' : message.role === 'player' ? 'Vous' : 'Système';
            return (
              <div key={message.id} className={bubbleClasses}>
                <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.35em]">
                  {message.role === 'coach' ? (
                    <MessageSquareText className="h-4 w-4 text-fuchsia-200" />
                  ) : message.role === 'player' ? (
                    <User className="h-4 w-4 text-cyan-200" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-white/60" />
                  )}
                  <span className={cn('font-semibold', message.role === 'system' ? 'text-white/70' : '')}>{label}</span>
                </div>
                <p className="mt-2 whitespace-pre-line">{message.content}</p>
              </div>
            );
          })}
          {coachLoading && (
            <div className="flex items-center gap-3 rounded-2xl border border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100">
              <Loader2 className="h-4 w-4 animate-spin" />
              Le coach analyse votre position…
            </div>
          )}
        </div>

        {coachError && (
          <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">{coachError}</p>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={chatInput}
              onChange={event => setChatInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSendChatMessage();
                }
              }}
              placeholder="Demandez un plan ou des explications…"
              className="flex-1 rounded-2xl border-fuchsia-300/40 bg-black/40 text-sm text-white placeholder:text-white/40"
            />
            <Button
              type="button"
              onClick={handleSendChatMessage}
              disabled={coachLoading || chatInput.trim().length === 0}
              className="rounded-2xl border-fuchsia-300/60 bg-fuchsia-500/20 p-3 text-fuchsia-100 transition-colors hover:border-fuchsia-200 hover:bg-fuchsia-500/30"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[0.65rem] leading-relaxed text-fuchsia-100/70">
            Exemple : 'Quel est le meilleur plan dans cette position ?' ou 'Comment s'appelle cette ouverture ?'
          </p>
        </div>
      </div>
    </div>
  );
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
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-8 sm:py-10 lg:px-12">
          {!isDesktop && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="group flex items-center gap-2 rounded-full border border-transparent bg-black/40 px-4 py-2 text-sm font-medium text-cyan-200/90 transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-white"
              >
                <ArrowLeft size={18} className="transition-transform duration-200 group-hover:-translate-x-1" />
                Retour
              </Button>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[0.55rem] uppercase tracking-[0.4em] text-cyan-200/70">Chess Coach 3D</p>
                  <h1 className="text-xl font-semibold text-white drop-shadow-[0_0_18px_rgba(59,130,246,0.55)]">
                    Interface IA
                  </h1>
                </div>
                <Drawer open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <DrawerTrigger asChild>
                    <Button className="flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 shadow-[0_0_25px_rgba(59,130,246,0.35)] transition-all duration-200 hover:border-cyan-200 hover:bg-cyan-400/20 hover:text-white">
                      <Menu className="h-4 w-4" />
                      Paramètres de la partie
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="mx-auto w-full max-w-xl rounded-t-[32px] border border-white/10 bg-[#040313]/95 pb-8 text-white">
                    <DrawerHeader className="px-6">
                      <DrawerTitle className="text-center text-lg font-semibold tracking-[0.3em] text-cyan-100 uppercase">
                        Centre de commande
                      </DrawerTitle>
                    </DrawerHeader>
                    <div className="space-y-6 px-6">
                      <div className="flex flex-col gap-4">{headerBadges}</div>
                      {aiDifficultyControls && <div className="flex flex-col gap-4">{aiDifficultyControls}</div>}
                      <div>{ruleSummaryBar}</div>
                      {customRulesBanner && <div>{customRulesBanner}</div>}
                      <div>{leftSidebarContent}</div>
                      <div className="space-y-4">{boardSummaryContent}</div>
                      <div>{coachSidebarContent}</div>
                      <DrawerClose asChild>
                        <Button className="w-full rounded-full border border-cyan-400/50 bg-cyan-500/10 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100 transition-all hover:border-cyan-200 hover:bg-cyan-500/20 hover:text-white">
                          Fermer les paramètres de la partie
                        </Button>
                      </DrawerClose>
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </div>
          )}

          {isDesktop && (
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
              {headerBadges}
            </header>
          )}

          {isDesktop && aiDifficultyControls && <div className="mt-6">{aiDifficultyControls}</div>}

          {isDesktop && <div className="mt-8">{ruleSummaryBar}</div>}

          {isDesktop && customRulesBanner && <div className="mt-6">{customRulesBanner}</div>}

          <main
            className={cn(
              'flex-1',
              isDesktop
                ? 'mt-10 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]'
                : 'mt-4 flex flex-1 flex-col items-center gap-6'
            )}
          >
            {isDesktop && <aside>{leftSidebarContent}</aside>}

            <section className="relative flex w-full flex-1 flex-col items-center gap-6 justify-start">
              <div className="relative w-full">
                <div className="absolute -inset-6 rounded-[40px] border border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-fuchsia-500/10 opacity-70 blur-2xl sm:-inset-8" />
                <div className="relative flex w-full flex-col gap-6 rounded-[30px] border border-white/20 bg-white/5/60 p-4 backdrop-blur-xl shadow-[0_45px_75px_-35px_rgba(59,130,246,0.65)] sm:p-6">
                  <div className="absolute inset-0 rounded-[30px] border border-white/10" />
                  <div className="relative flex flex-col gap-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full bg-gradient-to-r from-fuchsia-400 to-purple-600 shadow-[0_0_12px_rgba(236,72,153,0.6)]" />
                          <div>
                            <p className="text-[0.6rem] uppercase tracking-[0.4em] text-cyan-200/70">Joueur noir</p>
                            <p className="text-lg font-semibold text-white">{opponentDisplayName}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                          ELO {opponentElo}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className="border-cyan-400/60 bg-cyan-500/10 px-3 py-1 text-[0.7rem] font-semibold text-cyan-100">
                            Variante : {variantName}
                          </Badge>
                          {specialAbility && (
                            <Button
                              type="button"
                              onClick={handleSpecialAction}
                              className="flex items-center gap-2 rounded-full border border-fuchsia-400/60 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-100 transition-all duration-200 hover:border-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-white"
                            >
                              <Rocket className="h-4 w-4" />
                              {specialAbilityLabel || 'Attaque spéciale'}
                            </Button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            onClick={() => setSoundEnabled(prev => !prev)}
                            className={cn(
                              'flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition-all duration-200',
                              soundEnabled
                                ? 'border-cyan-300/60 bg-cyan-500/10 text-cyan-100 hover:border-cyan-200 hover:bg-cyan-500/20 hover:text-white'
                                : 'border-white/20 bg-black/30 text-white/60 hover:border-white/40 hover:text-white'
                            )}
                          >
                            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                            {soundEnabled ? 'Son activé' : 'Son coupé'}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => setCoachEnabled(prev => !prev)}
                            className={cn(
                              'flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition-all duration-200',
                              coachEnabled
                                ? 'border-fuchsia-300/60 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-white'
                                : 'border-white/20 bg-black/30 text-white/60 hover:border-white/40 hover:text-white'
                            )}
                          >
                            <Bot className="h-4 w-4" />
                            {coachEnabled ? 'Coach actif' : 'Coach inactif'}
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <span className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-200/70">
                          Pièces capturées par {opponentDisplayName}
                        </span>
                        <div className="flex flex-wrap items-center gap-1 text-2xl text-white">
                          {blackCapturedPieces.length > 0 ? (
                            blackCapturedPieces.map((piece, index) => (
                              <span
                                key={`captured-black-${piece.type}-${index}`}
                                className="drop-shadow-[0_0_12px_rgba(236,72,153,0.45)]"
                              >
                                {CAPTURED_PIECE_SYMBOLS[piece.type][piece.color]}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-white/40">Aucune</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="relative flex w-full justify-center">
                      <ChessBoard gameState={gameState} onSquareClick={handleSquareClick} onPieceClick={handlePieceClick} />
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <span className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-200/70">
                          Pièces capturées par {playerDisplayName}
                        </span>
                        <div className="flex flex-wrap items-center gap-1 text-2xl text-white">
                          {whiteCapturedPieces.length > 0 ? (
                            whiteCapturedPieces.map((piece, index) => (
                              <span
                                key={`captured-white-${piece.type}-${index}`}
                                className="drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]"
                              >
                                {CAPTURED_PIECE_SYMBOLS[piece.type][piece.color]}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-white/40">Aucune</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 shadow-[0_0_12px_rgba(56,189,248,0.6)]" />
                          <div>
                            <p className="text-[0.6rem] uppercase tracking-[0.4em] text-cyan-200/70">Joueur blanc</p>
                            <p className="text-lg font-semibold text-white">{playerDisplayName}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                          ELO {playerElo}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-6 bottom-4 h-20 rounded-full bg-gradient-to-b from-transparent via-cyan-400/10 to-cyan-400/30 blur-3xl sm:inset-x-12 sm:h-24" />
                </div>
              </div>

              {isDesktop && boardSummaryContent}
            </section>

            {isDesktop && (
              <aside className="space-y-6 lg:sticky lg:top-6">
                {coachSidebarContent}
              </aside>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Play;
