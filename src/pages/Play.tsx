import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Bomb, Bot, Loader2, Menu, MessageSquareText, Rocket, RotateCcw, Send,
  Sparkles, Target, User, Volume2, VolumeX
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import {
  GameState, Position, ChessPiece, ChessRule, PieceColor, ChessMove, SpecialAttackInstance,
  PieceType, VisualEffect
} from '@/types/chess';
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
import { useSoundEffects, type SoundEffect } from '@/hooks/useSoundEffects';
import {
  getSpecialAbilityMetadata,
  normalizeSpecialAbilityParameters,
  resolveSpecialAbilityName,
  type SpecialAbilityActivation,
  type SpecialAbilityKey,
  type SpecialAbilityTrigger,
} from '@/lib/specialAbilities';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import {
  analyzeCompletedGame,
  deserializeBoardState,
  formatMoveNotation,
  serializeBoardState,
} from '@/lib/postGameAnalysis';
import { saveCompletedGame } from '@/lib/gameStorage';
import { fetchTournamentMatch, requestTournamentMatch } from '@/lib/tournamentApi';
import { loadPresetRulesFromDatabase, convertRuleJsonToChessRule } from '@/lib/presetRulesAdapter';
import { useRuleEngine } from '@/hooks/useRuleEngine';
import { FxProvider, useFxTrigger } from '@/fx/context';
import type { RuleJSON } from '@/engine/types';

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

const PIECE_TYPES: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

const PIECE_TYPE_LABELS: Record<PieceType, string> = {
  king: 'le roi',
  queen: 'la reine',
  rook: 'la tour',
  bishop: 'le fou',
  knight: 'le cavalier',
  pawn: 'le pion',
};

const isPieceType = (value: unknown): value is PieceType => {
  return typeof value === 'string' && PIECE_TYPES.includes(value as PieceType);
};

const formatPieceList = (pieces: PieceType[]): string => {
  if (pieces.length === 0) return '';
  const labels = pieces.map(piece => PIECE_TYPE_LABELS[piece]);
  if (labels.length === 1) return labels[0];
  const head = labels.slice(0, -1).join(', ');
  const tail = labels[labels.length - 1];
  return `${head} et ${tail}`;
};

type FreezeApplication = {
  color: PieceColor;
  positions: Position[];
  turns: number;
};

const collectPiecesWithinRadius = (
  board: (ChessPiece | null)[][],
  center: Position,
  radius: number,
  color: PieceColor,
): Position[] => {
  const affected: Position[] = [];
  for (let row = Math.max(0, center.row - radius); row <= Math.min(7, center.row + radius); row++) {
    for (let col = Math.max(0, center.col - radius); col <= Math.min(7, center.col + radius); col++) {
      const dRow = Math.abs(row - center.row);
      const dCol = Math.abs(col - center.col);
      if (Math.max(dRow, dCol) > radius) continue;
      const target = ChessEngine.getPieceAt(board, { row, col });
      if (target && target.color === color) {
        affected.push({ row, col });
      }
    }
  }
  return affected;
};

const mergeFreezeEffects = (
  current: GameState['freezeEffects'],
  board: (ChessPiece | null)[][],
  applications: FreezeApplication[],
): GameState['freezeEffects'] => {
  if (applications.length === 0) return current;

  const updated = current.map(effect => ({ ...effect }));

  applications.forEach(({ color, positions, turns }) => {
    positions.forEach(position => {
      const target = ChessEngine.getPieceAt(board, position);
      if (!target || target.color !== color) return;

      const existingIndex = updated.findIndex(effect =>
        effect.color === color && effect.position.row === position.row && effect.position.col === position.col
      );

      if (existingIndex >= 0) {
        if (updated[existingIndex].remainingTurns < turns) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            remainingTurns: turns,
          };
        }
      } else {
        updated.push({
          color,
          position: { ...position },
          remainingTurns: turns,
        });
      }
    });
  });

  return updated;
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

const ABILITY_ICON_MAP: Record<string, LucideIcon> = {
  bomb: Bomb,
  target: Target,
};

const SPECIAL_SOUND_EFFECTS: readonly SoundEffect[] = ['explosion', 'quantum-explosion', 'mine-detonation'] as const;

const toSoundEffect = (value: unknown, fallback: SoundEffect): SoundEffect => {
  if (typeof value !== 'string') return fallback;
  return (SPECIAL_SOUND_EFFECTS as readonly string[]).includes(value) ? (value as SoundEffect) : fallback;
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toAnimationName = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
};

const ruleTargetsPiece = (rule: ChessRule, piece: ChessPiece | null): boolean => {
  if (!piece) return false;
  if (rule.affectedPieces.length === 0) return true;
  return rule.affectedPieces.includes('all') || rule.affectedPieces.includes(piece.type);
};

interface SpecialAbilityOption {
  id: string;
  ruleId: string;
  ruleName: string;
  ability: SpecialAbilityKey;
  label: string;
  description: string;
  icon: 'bomb' | 'target';
  trigger: SpecialAbilityTrigger;
  radius: number;
  countdown: number;
  damage: number;
  animation: string;
  sound: string;
  buttonLabel?: string;
  activation: SpecialAbilityActivation;
  freezeTurns?: number;
  allowOccupied?: boolean;
}

type DeployResult =
  | {
      success: true;
      coordinate: string;
      trigger: SpecialAbilityTrigger;
      countdown: number;
      abilityLabel: string;
    }
  | {
      success: false;
      reason: 'state' | 'occupied' | 'duplicate' | 'invalid';
    };

function samePos(a: Position, b: Position) {
  return a.row === b.row && a.col === b.col;
}
function inRadius(center: Position, p: Position, r: number) {
  return Math.max(Math.abs(center.row - p.row), Math.abs(center.col - p.col)) <= r;
}

const Play = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const fx = useFxTrigger();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { play: playSfx } = useSoundEffects(soundEnabled);

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
    matchId?: string;
    matchStatus?: string;
    tournamentId?: string;
  } | undefined;

  const params = useParams<{ matchId?: string }>();

  const opponentType = locationState?.opponentType === 'player'
    ? 'player'
    : locationState?.opponentType === 'local'
      ? 'local'
      : 'ai';
  const lobbyId = typeof locationState?.lobbyId === 'string' ? locationState.lobbyId : undefined;
  const initialLobbyRole = locationState?.role === 'creator' || locationState?.role === 'opponent' ? locationState.role : undefined;
  const initialLobbyName = typeof locationState?.lobbyName === 'string' ? locationState.lobbyName : undefined;
  const initialOpponentName = typeof locationState?.opponentName === 'string' ? locationState.opponentName : undefined;
  const playerName = typeof locationState?.playerName === 'string' ? locationState.playerName : undefined;
  const routeMatchId = typeof params.matchId === 'string' ? params.matchId : undefined;
  const stateMatchId = typeof locationState?.matchId === 'string' ? locationState.matchId : undefined;
  const matchId = stateMatchId ?? routeMatchId;
  const tournamentId = typeof locationState?.tournamentId === 'string' ? locationState.tournamentId : undefined;
  const initialMatchStatus = typeof locationState?.matchStatus === 'string' ? locationState.matchStatus : null;

  const [currentLobbyRole, setCurrentLobbyRole] = useState<typeof initialLobbyRole>(initialLobbyRole);
  const [currentLobbyName, setCurrentLobbyName] = useState<string | undefined>(initialLobbyName);
  const [currentOpponentName, setCurrentOpponentName] = useState<string | undefined>(initialOpponentName);
  const [matchStatus, setMatchStatus] = useState<string | null>(initialMatchStatus);
  const [waitingForOpponent, setWaitingForOpponent] = useState<boolean>(() =>
    opponentType === 'player' && (initialMatchStatus === 'pending' || (!!initialLobbyRole && initialLobbyRole === 'creator' && !initialOpponentName))
  );

  useEffect(() => setCurrentLobbyRole(initialLobbyRole), [initialLobbyRole]);
  useEffect(() => setCurrentLobbyName(initialLobbyName), [initialLobbyName]);
  useEffect(() => setCurrentOpponentName(initialOpponentName), [initialOpponentName]);

  useEffect(() => {
    setMatchStatus(initialMatchStatus);
    if (opponentType === 'player') {
      const shouldWait = initialMatchStatus === 'pending' || (!!initialLobbyRole && initialLobbyRole === 'creator' && !initialOpponentName);
      setWaitingForOpponent(shouldWait);
    }
  }, [initialMatchStatus, opponentType, initialLobbyRole, initialOpponentName]);

  const playerDisplayName = playerName ?? 'Vous';
  const opponentDisplayName = currentOpponentName
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

  const triggerAiFallback = useCallback(async () => {
    if (!tournamentId) return;
    try {
      await requestTournamentMatch(tournamentId, {
        displayName: playerDisplayName,
        forceAiFallback: true,
      });
    } catch (error) {
      console.error('[play] unable to attach AI fallback', error);
      toast({
        title: 'Matchmaking',
        description: "Impossible de lancer la partie contre l'IA.",
        variant: 'destructive',
      });
    }
  }, [playerDisplayName, toast, tournamentId]);

  useEffect(() => {
    if (!matchId) return;

    let cancelled = false;
    const fallbackHost = initialLobbyRole === 'creator';

    const syncMatchDetails = async () => {
      try {
        const details = await fetchTournamentMatch(matchId);
        if (!details || cancelled) return;

        setMatchStatus(details.status ?? null);

        if (details.lobby?.name) setCurrentLobbyName(details.lobby.name);

        if (details.is_ai_match) {
          setCurrentOpponentName(details.ai_opponent_label ?? 'Voltus AI');
        } else if (details.lobby?.opponent_name) {
          setCurrentOpponentName(details.lobby.opponent_name);
        }

        if (user?.id) {
          if (details.player1_id === user.id) setCurrentLobbyRole('creator');
          else if (details.player2_id === user.id) setCurrentLobbyRole('opponent');
        }

        const hostId = details.player1_id ?? null;
        const isHost = user?.id ? user.id === hostId : fallbackHost;
        if (opponentType === 'player') {
          setWaitingForOpponent((details.status ?? null) === 'pending' && !!isHost);
        }
      } catch (error) {
        console.error('[play] unable to synchroniser le match', error);
      }
    };

    void syncMatchDetails();

    const channel = supabase
      .channel(`tournament-match-${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_matches', filter: `id=eq.${matchId}` }, payload => {
        const updated = payload.new as {
          status?: string; player1_id?: string; player2_id?: string;
          is_ai_match?: boolean | null; ai_opponent_label?: string | null;
        };
        const updatedStatus = updated?.status ?? null;
        setMatchStatus(updatedStatus);

        if (user?.id) {
          if (updated?.player1_id === user.id) setCurrentLobbyRole('creator');
          else if (updated?.player2_id === user.id) setCurrentLobbyRole('opponent');
        }

        const isHost = user?.id ? updated?.player1_id === user.id : fallbackHost;
        if (opponentType === 'player') {
          setWaitingForOpponent(updatedStatus === 'pending' && !!isHost);
        }

        if (updated?.is_ai_match && updated.ai_opponent_label) {
          setCurrentOpponentName(updated.ai_opponent_label);
        }

        if (updatedStatus === 'playing' || updatedStatus === 'finished') {
          void syncMatchDetails();
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [matchId, opponentType, user?.id, initialLobbyRole]);

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

  const [dbLoadedRules, setDbLoadedRules] = useState<ChessRule[]>([]);
  const [dbRulesLoaded, setDbRulesLoaded] = useState(false);

  useEffect(() => {
    const loadDbRules = async () => {
      try {
        const presetRules = await loadPresetRulesFromDatabase();

        const aiRules: ChessRule[] = [];
        if (user?.id) {
          const { data: rulesData, error } = await supabase
            .from('chess_rules')
            .select('rule_json')
            .eq('status', 'active')
            .eq('created_by', user.id)
            .in('source', ['custom', 'ai_generated']);

          if (!error && rulesData) {
            rulesData.forEach(row => {
              if (row.rule_json) {
                try {
                  const converted = convertRuleJsonToChessRule(row.rule_json);
                  aiRules.push(converted);
                } catch (err) {
                  console.warn('[Play] Failed to convert AI rule', err);
                }
              }
            });
          }
        }

        setDbLoadedRules([...presetRules, ...aiRules]);
        setDbRulesLoaded(true);
      } catch (error) {
        console.error('[Play] Failed to load DB rules', error);
        setDbLoadedRules(allPresetRules);
        setDbRulesLoaded(true);
      }
    };

    loadDbRules();
  }, [user?.id]);

  const [customRules, setCustomRules] = useState<ChessRule[]>(analyzedCustomRules);
  const activePresetRule = useMemo(() => {
    if (initialPresetRuleIds.length === 0 || !dbRulesLoaded) return null;
    const [firstRuleId] = initialPresetRuleIds;
    return dbLoadedRules.find(rule => rule.ruleId === firstRuleId) ?? null;
  }, [initialPresetRuleIds, dbLoadedRules, dbRulesLoaded]);
  const appliedPresetRuleIds = useMemo(() => new Set(initialPresetRuleIds), [initialPresetRuleIds]);
  const primaryRule = customRules[0] ?? activePresetRule ?? null;
  const variantName = primaryRule?.ruleName ?? 'Standard';
  const activeCustomRulesCount = customRules.length;

  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('ai-difficulty');
      if (stored && isAIDifficulty(stored)) return stored;
    }
    return 'standard';
  });

  const aiDifficultyMeta = AI_DIFFICULTY_LEVELS[aiDifficulty];
  const aiSearchDepth = Math.max(1, aiDifficultyMeta.depth);

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 1024;
    return false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [pendingAbility, setPendingAbility] = useState<SpecialAbilityOption | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const aiFallbackTriggeredRef = useRef(false);
  const aiFallbackTimeoutRef = useRef<number | null>(null);
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
      blindOpeningRevealed: { white: false, black: false },
      specialAttacks: [],
      visualEffects: [],
    };
  });

  const initialBoardSnapshotRef = useRef(serializeBoardState(gameState.board));

  const [timeRemaining, setTimeRemaining] = useState(() => ({
    white: initialTimeSeconds,
    black: initialTimeSeconds,
  }));

  const capturedPiecesByColor = useMemo(() => {
    const grouped: Record<PieceColor, ChessPiece[]> = { white: [], black: [] };
    for (const piece of gameState.capturedPieces) grouped[piece.color].push(piece);

    return {
      white: [...grouped.white].sort((a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type]),
      black: [...grouped.black].sort((a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type])
    };
  }, [gameState.capturedPieces]);

  const specialAbilities = useMemo<SpecialAbilityOption[]>(() => {
    const options: SpecialAbilityOption[] = [];
    const seen = new Set<string>();

    gameState.activeRules.forEach(rule => {
      const ruleAsAny = rule as any;
      const originalJson = ruleAsAny.__originalRuleJson;

      if (!originalJson?.ui?.actions) return;

      originalJson.ui.actions.forEach((uiAction: any, index: number) => {
        if (!uiAction.id || !uiAction.id.startsWith('special_')) return;

        const id = `${rule.ruleId}-${uiAction.id}-${index}`;
        if (seen.has(id)) return;
        seen.add(id);

        const icon = uiAction.icon === '❄️' ? 'target' : 'bomb';
        const label = uiAction.label || uiAction.hint || 'Action spéciale';
        const cooldown = uiAction.cooldown?.perPiece || 2;

        options.push({
          id,
          ruleId: rule.ruleId,
          ruleName: rule.ruleName,
          ability: 'deployBomb' as SpecialAbilityKey,
          label,
          description: uiAction.hint || label,
          icon,
          trigger: 'instant' as SpecialAbilityTrigger,
          radius: 1,
          countdown: cooldown,
          damage: 100,
          animation: 'explosion',
          sound: 'explosion',
          buttonLabel: label,
          activation: 'manual' as SpecialAbilityActivation,
          freezeTurns: 2,
          allowOccupied: false,
        });
      });
    });

    return options;
  }, [gameState.activeRules]);

  // ---------- Déploiement capacité (corrigé)
  const deploySpecialAttack = useCallback(
    (
      ability: SpecialAbilityOption,
      position: Position,
      options?: { allowOccupied?: boolean; clearSelection?: boolean }
    ): DeployResult => {
      let outcome: DeployResult = { success: false, reason: 'state' };

      setGameState(prev => {
        if (['checkmate', 'stalemate', 'draw', 'timeout'].includes(prev.gameStatus)) {
          outcome = { success: false, reason: 'state' };
          return prev;
        }

        if (!ChessEngine.isValidPosition(position)) {
          outcome = { success: false, reason: 'invalid' };
          return prev;
        }

        const allowOccupied = ability.allowOccupied || options?.allowOccupied || false;
        const occupant = ChessEngine.getPieceAt(prev.board, position);
        if (occupant && !allowOccupied) {
          outcome = { success: false, reason: 'occupied' };
          return prev;
        }

        const alreadyArmed = prev.specialAttacks.some(
          a => a.position.row === position.row && a.position.col === position.col
        );
        if (alreadyArmed) {
          outcome = { success: false, reason: 'duplicate' };
          return prev;
        }

        const attackId = `${ability.ability}-${Date.now()}`;
        const owner: PieceColor = prev.currentPlayer;

        const newAttack: SpecialAttackInstance = {
          id: attackId,
          position: { ...position },
          radius: ability.radius ?? 1,
          trigger: ability.trigger,            // 'instant' | 'onEnter' | etc.
          countdown: Math.max(0, ability.countdown ?? 0),
          owner,
          damage: ability.damage ?? 100,
          meta: {
            ruleId: ability.ruleId,
            label: ability.label,
          },
        };

        const armVfx: VisualEffect = {
          id: `arm-${attackId}`,
          name: toAnimationName(ability.animation, 'explosion'),
          position: { ...position },
          ttl: 900,
        };

        const next: GameState = {
          ...prev,
          specialAttacks: [...prev.specialAttacks, newAttack],
          visualEffects: [...prev.visualEffects, armVfx],
        };

        // Consommer le tour quand on déploie la capacité
        next.currentPlayer = prev.currentPlayer === 'white' ? 'black' : 'white';
        next.turnNumber = prev.currentPlayer === 'black' ? prev.turnNumber + 1 : prev.turnNumber;
        next.movesThisTurn = 0;

        outcome = {
          success: true,
          coordinate: ChessEngine.toAlgebraic(position),
          trigger: ability.trigger,
          countdown: newAttack.countdown,
          abilityLabel: ability.label,
        };

        return next;
      });

      if (outcome.success) {
        fx?.({ type: 'vfx', name: toAnimationName(ability.animation, 'explosion'), position });
        playSfx(toSoundEffect(ability.sound, 'explosion'));
        queueMicrotask(() => {
          toast({
            title: ability.label,
            description:
              outcome.trigger === 'instant'
                ? `Capacité déployée en ${outcome.coordinate}.`
                : `Capacité armée en ${outcome.coordinate} (déclenchement : ${outcome.trigger}).`,
          });
        });
        if (options?.clearSelection) selectionTimestampRef.current = Date.now();
      } else {
        queueMicrotask(() => {
          const reason =
            outcome.reason === 'occupied' ? 'La case est occupée.' :
            outcome.reason === 'duplicate' ? 'Une capacité est déjà armée ici.' :
            outcome.reason === 'invalid'   ? 'Coordonnée invalide.' :
                                             "Action impossible dans l'état actuel.";
          toast({ title: 'Déploiement refusé', description: reason, variant: 'destructive' });
        });
      }

      return outcome;
    },
    [fx, playSfx, toast]
  );

  // ---------- Détonation / interception / tic-tac
  const detonateAttack = useCallback((state: GameState, attack: SpecialAttackInstance, victimPos: Position): GameState => {
    const vfx: VisualEffect = {
      id: `boom-${attack.id}`,
      name: 'explosion',
      position: { ...attack.position },
      ttl: 900,
    };

    const board = state.board.map(row => row.slice());
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = { row: r, col: c };
        const piece = ChessEngine.getPieceAt(board, p);
        if (!piece) continue;
        if (inRadius(attack.position, p, attack.radius)) {
          // capture brute
          ChessEngine.setPieceAt(board, p, null);
          state.capturedPieces.push(piece);
        }
      }
    }

    const next: GameState = {
      ...state,
      board,
      visualEffects: [...state.visualEffects, vfx],
      specialAttacks: state.specialAttacks.filter(a => a.id !== attack.id),
    };

    queueMicrotask(() => {
      fx?.({ type: 'vfx', name: 'explosion', position: attack.position });
      playSfx('explosion');
      toast({ title: attack.meta?.label ?? 'Détonation', description: 'BOOM 💥' });
    });

    return next;
  }, [fx, playSfx, toast]);

  const interceptMoveWithTraps = useCallback((state: GameState, to: Position, movingColor: PieceColor) => {
    const trigger = state.specialAttacks.find(
      a => a.trigger !== 'instant' && samePos(a.position, to) && a.owner !== movingColor
    );

    if (!trigger) return { blocked: false, state };

    // Choix : bloquer ET faire exploser
    const after = detonateAttack(state, trigger, to);
    queueMicrotask(() => {
      toast({ title: 'Bloqué', description: 'Un piège bloque la case.', variant: 'destructive' });
      fx?.({ type: 'vfx', name: 'shield_block', position: to });
      playSfx('mine-detonation');
    });
    return { blocked: true, state: after };
  }, [detonateAttack, fx, playSfx, toast]);

  const applyTurnTickForAttacks = useCallback((state: GameState): GameState => {
    if (!state.specialAttacks.length) return state;

    let next = { ...state, specialAttacks: state.specialAttacks.map(a => ({ ...a })) };
    const toDetonate: SpecialAttackInstance[] = [];

    next.specialAttacks.forEach(a => {
      if (a.countdown > 0) a.countdown -= 1;
      if (a.countdown === 0 && a.trigger === 'instant') {
        toDetonate.push(a);
      }
    });

    if (toDetonate.length) {
      toDetonate.forEach(a => {
        next = detonateAttack(next, a, a.position);
      });
    }

    return next;
  }, [detonateAttack]);

  // ---------- Handlers plateau
  const handleBoardClickForAbility = useCallback(
    (pos: Position) => {
      if (!pendingAbility) return;
      const res = deploySpecialAttack(pendingAbility, pos, { clearSelection: true });
      if (res.success) setPendingAbility(null);
    },
    [pendingAbility, deploySpecialAttack]
  );

  const handleSquareClick = useCallback((pos: Position) => {
    // Si une capacité est en ciblage → on tente le déploiement
    if (pendingAbility) {
      handleBoardClickForAbility(pos);
      return;
    }

    setGameState(prev => {
      if (prev.gameStatus !== 'active') return prev;

      const board = prev.board;
      const clicked = ChessEngine.getPieceAt(board, pos);

      // Sélection d'une pièce du joueur courant
      if (clicked && clicked.color === prev.currentPlayer) {
        const valid = ChessEngine.getValidMoves(board, pos, prev.currentPlayer);
        return {
          ...prev,
          selectedPiece: { piece: clicked, position: pos },
          validMoves: valid
        };
      }

      // Déplacement si une pièce était sélectionnée
      if (prev.selectedPiece) {
        const { position: from } = prev.selectedPiece;
        const isValid = prev.validMoves.some(m => samePos(m.to, pos));
        if (!isValid) {
          // reset sélection si clic à côté
          return { ...prev, selectedPiece: null, validMoves: [] };
        }

        // Intercepter les pièges sur la case d'arrivée
        const intercept = interceptMoveWithTraps(prev, pos, prev.currentPlayer);
        if (intercept.blocked) {
          // Annule le move et applique l’état modifié par le piège
          return {
            ...intercept.state,
            selectedPiece: null,
            validMoves: []
          };
        }

        // Appliquer le coup
        const after = ChessEngine.applyMove(prev, { from, to: pos });
        after.selectedPiece = null;
        after.validMoves = [];

        // Fin de tour → tic-tac des pièges
        after.currentPlayer = prev.currentPlayer === 'white' ? 'black' : 'white';
        after.turnNumber = prev.currentPlayer === 'black' ? prev.turnNumber + 1 : prev.turnNumber;
        after.movesThisTurn = 0;

        const afterTick = applyTurnTickForAttacks(after);
        return afterTick;
      }

      return prev;
    });
  }, [pendingAbility, handleBoardClickForAbility, interceptMoveWithTraps, applyTurnTickForAttacks]);

  // ---------- UI helpers
  const abilityButtons = (
    <div className="flex flex-wrap gap-2">
      {specialAbilities.map(opt => {
        const Icon = ABILITY_ICON_MAP[opt.icon] ?? Bomb;
        const active = pendingAbility?.id === opt.id;
        return (
          <Button
            key={opt.id}
            variant={active ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setPendingAbility(active ? null : opt)}
            className={cn('gap-2', active && 'ring-2 ring-offset-2')}
            title={opt.description}
          >
            <Icon className="h-4 w-4" />
            {opt.buttonLabel ?? opt.label}
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Retour">
            <ArrowLeft />
          </Button>
          <div className="text-sm text-muted-foreground">{variantName}</div>
          {activeCustomRulesCount > 0 && (
            <Badge variant="outline">{activeCustomRulesCount} règle{activeCustomRulesCount > 1 ? 's' : ''}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSoundEnabled(s => !s)}
            aria-label={soundEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {soundEnabled ? <Volume2 /> : <VolumeX />}
          </Button>
        </div>
      </div>

      <div className="p-3 border-b">
        {abilityButtons}
        {pendingAbility && (
          <div className="mt-2 text-xs text-muted-foreground">
            Cliquez une case sur l’échiquier pour déployer <strong>{pendingAbility.label}</strong>…
          </div>
        )}
      </div>

      <div className="flex-1 grid md:grid-cols-2 gap-4 p-4">
        <div className="flex items-center justify-center">
          {/* ⚠️ Ajustez les props si votre ChessBoard a une API différente */}
          <ChessBoard
            board={gameState.board}
            selected={gameState.selectedPiece?.position ?? null}
            validMoves={gameState.validMoves}
            visualEffects={gameState.visualEffects}
            onSquareClick={handleSquareClick}
            lastMove={
              gameState.moveHistory.length
                ? gameState.moveHistory[gameState.moveHistory.length - 1]
                : null
            }
            currentPlayer={gameState.currentPlayer}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="p-3 border rounded-md">
            <div className="font-medium">Infos</div>
            <div className="text-sm text-muted-foreground mt-1">
              Joueur: {playerDisplayName} • Adversaire: {opponentDisplayName}
            </div>
            <div className="text-sm text-muted-foreground">
              Tour: {gameState.turnNumber} • Trait: {gameState.currentPlayer === 'white' ? 'Blancs' : 'Noirs'}
            </div>
            <div className="text-sm text-muted-foreground">
              Status: {gameState.gameStatus}
            </div>
          </div>

          <div className="p-3 border rounded-md">
            <div className="font-medium mb-2">Pièces capturées</div>
            <div className="text-sm">
              <div className="mb-1">Par Blancs:&nbsp;
                {capturedPiecesByColor.black.map((p, i) => CAPTURED_PIECE_SYMBOLS[p.type].black).join(' ') || '—'}
              </div>
              <div>Par Noirs:&nbsp;
                {capturedPiecesByColor.white.map((p, i) => CAPTURED_PIECE_SYMBOLS[p.type].white).join(' ') || '—'}
              </div>
            </div>
          </div>

          <div className="p-3 border rounded-md">
            <div className="font-medium mb-2">Historique</div>
            <div className="text-xs max-h-56 overflow-auto font-mono leading-5">
              {gameState.moveHistory.length === 0 ? (
                <div className="text-muted-foreground">Aucun coup joué.</div>
              ) : (
                gameState.moveHistory.map((m, idx) => (
                  <div key={idx}>
                    {idx + 1}. {formatMoveNotation(m)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Play;
