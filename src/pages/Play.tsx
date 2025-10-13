import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Bomb, Bot, Loader2, Menu, MessageSquareText, Rocket, RotateCcw, Send, Sparkles, Target, User, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ChessBoard from '@/components/ChessBoard';
import { ChessEngine } from '@/lib/chessEngine';
import { GameState, Position, ChessPiece, ChessRule, PieceColor, ChessMove, SpecialAttackInstance, PieceType, VisualEffect } from '@/types/chess';
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
import { getSpecialAbilityMetadata, normalizeSpecialAbilityParameters, type SpecialAbilityKey, type SpecialAbilityTrigger } from '@/lib/specialAbilities';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import {
  analyzeCompletedGame,
  deserializeBoardState,
  formatMoveNotation,
  serializeBoardState,
} from '@/lib/postGameAnalysis';
import { saveCompletedGame } from '@/lib/gameStorage';
import { fetchTournamentMatch } from '@/lib/tournamentApi';

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
  const initialMatchStatus = typeof locationState?.matchStatus === 'string' ? locationState.matchStatus : null;

  const [currentLobbyRole, setCurrentLobbyRole] = useState<typeof initialLobbyRole>(initialLobbyRole);
  const [currentLobbyName, setCurrentLobbyName] = useState<string | undefined>(initialLobbyName);
  const [currentOpponentName, setCurrentOpponentName] = useState<string | undefined>(initialOpponentName);
  const [matchStatus, setMatchStatus] = useState<string | null>(initialMatchStatus);
  const [waitingForOpponent, setWaitingForOpponent] = useState<boolean>(() =>
    opponentType === 'player' && (initialMatchStatus === 'pending' || (!!initialLobbyRole && initialLobbyRole === 'creator' && !initialOpponentName))
  );

  useEffect(() => {
    setCurrentLobbyRole(initialLobbyRole);
  }, [initialLobbyRole]);

  useEffect(() => {
    setCurrentLobbyName(initialLobbyName);
  }, [initialLobbyName]);

  useEffect(() => {
    setCurrentOpponentName(initialOpponentName);
  }, [initialOpponentName]);

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

  const { toast } = useToast();

  useEffect(() => {
    if (!matchId) return;

    let cancelled = false;
    const fallbackHost = initialLobbyRole === 'creator';

    const syncMatchDetails = async () => {
      try {
        const details = await fetchTournamentMatch(matchId);
        if (!details || cancelled) return;

        setMatchStatus(details.status ?? null);

        if (details.lobby?.name) {
          setCurrentLobbyName(details.lobby.name);
        }

        if (details.is_ai_match) {
          setCurrentOpponentName(details.ai_opponent_label ?? 'Voltus AI');
        } else if (details.lobby?.opponent_name) {
          setCurrentOpponentName(details.lobby.opponent_name);
        }

        if (user?.id) {
          if (details.player1_id === user.id) {
            setCurrentLobbyRole('creator');
          } else if (details.player2_id === user.id) {
            setCurrentLobbyRole('opponent');
          }
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
        const updated = payload.new as { status?: string; player1_id?: string; player2_id?: string; is_ai_match?: boolean | null; ai_opponent_label?: string | null; };
        const updatedStatus = updated?.status ?? null;
        setMatchStatus(updatedStatus);

        if (user?.id) {
          if (updated?.player1_id === user.id) {
            setCurrentLobbyRole('creator');
          } else if (updated?.player2_id === user.id) {
            setCurrentLobbyRole('opponent');
          }
        }

        const isHost = user?.id ? updated?.player1_id === user.id : fallbackHost;
        if (opponentType === 'player') {
          setWaitingForOpponent(updatedStatus === 'pending' && !!isHost);
        }

        if (updated?.is_ai_match && updated.ai_opponent_label) {
          setCurrentOpponentName(updated.ai_opponent_label);
        }

        if (updatedStatus === 'in_progress' || updatedStatus === 'completed') {
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

  const [customRules, setCustomRules] = useState<ChessRule[]>(analyzedCustomRules);
  const activePresetRule = useMemo(() => {
    if (initialPresetRuleIds.length === 0) return null;
    const [firstRuleId] = initialPresetRuleIds;
    return allPresetRules.find(rule => rule.ruleId === firstRuleId) ?? null;
  }, [initialPresetRuleIds]);
  const appliedPresetRuleIds = useMemo(() => new Set(initialPresetRuleIds), [initialPresetRuleIds]);
  const primaryRule = customRules[0] ?? activePresetRule ?? null;
  const variantName = primaryRule?.ruleName ?? 'Standard';
  const activeCustomRulesCount = customRules.length;

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
  const [pendingAbility, setPendingAbility] = useState<SpecialAbilityOption | null>(null);

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
    for (const piece of gameState.capturedPieces) {
      grouped[piece.color].push(piece);
    }

    return {
      white: [...grouped.white].sort((a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type]),
      black: [...grouped.black].sort((a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type])
    };
  }, [gameState.capturedPieces]);

  const specialAbilities = useMemo<SpecialAbilityOption[]>(() => {
    const options: SpecialAbilityOption[] = [];
    const seen = new Set<string>();

    gameState.activeRules.forEach(rule => {
      rule.effects.forEach((effect, index) => {
        if (effect.action !== 'addAbility' || typeof effect.parameters?.ability !== 'string') {
          return;
        }

        const normalized = normalizeSpecialAbilityParameters(
          effect.parameters.ability,
          effect.parameters as Record<string, unknown> | undefined,
        );
        const metadata = getSpecialAbilityMetadata(effect.parameters.ability);

        if (!normalized || !metadata) {
          return;
        }

        const id = `${rule.ruleId}-${normalized.ability}-${index}`;
        if (seen.has(id)) {
          return;
        }
        seen.add(id);

        options.push({
          id,
          ruleId: rule.ruleId,
          ruleName: rule.ruleName,
          ability: normalized.ability,
          label: metadata.label,
          description: metadata.description,
          icon: metadata.icon,
          trigger: normalized.trigger,
          radius: normalized.radius,
          countdown: normalized.countdown,
          damage: normalized.damage,
          animation: normalized.animation,
          sound: normalized.sound,
          buttonLabel: metadata.buttonLabel,
          freezeTurns: normalized.freezeTurns,
          allowOccupied: normalized.allowOccupied,
        });
      });
    });

    return options;
  }, [gameState.activeRules]);

  
  const deploySpecialAttack = useCallback(
    (ability: SpecialAbilityOption, position: Position, options?: { allowOccupied?: boolean; clearSelection?: boolean }): DeployResult => {
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
          attack => attack.position.row === position.row && attack.position.col === position.col,
        );
        if (alreadyArmed) {
          outcome = { success: false, reason: 'duplicate' };
          return prev;
        }

        const attackId = `${ability.ability}-${Date.now()}`;
        const specialAttack: SpecialAttackInstance = {
          id: attackId,
          ability: ability.ability,
          owner: prev.currentPlayer,
          position,
          radius: ability.radius,
          countdown: ability.countdown,
          remaining: ability.countdown,
          damage: ability.damage,
          trigger: ability.trigger,
          animation: ability.animation,
          sound: ability.sound,
          ruleName: ability.ruleName,
          freezeTurns: ability.freezeTurns,
        };

        const coordinate = `${FILES[position.col] ?? '?'}${8 - position.row}`;
        outcome = {
          success: true,
          coordinate,
          trigger: ability.trigger,
          countdown: ability.countdown,
          abilityLabel: ability.label,
        };

        const nextState: GameState = {
          ...prev,
          specialAttacks: [...prev.specialAttacks, specialAttack],
        };

        if (options?.clearSelection) {
          nextState.selectedPiece = null;
          nextState.validMoves = [];
        }

        return nextState;
      });

      if (outcome.success) {
        const countdownInfo = outcome.trigger === 'countdown'
          ? `Détonation programmée dans ${outcome.countdown} tour${outcome.countdown > 1 ? 's' : ''}.`
          : `Charge posée sur ${outcome.coordinate}.`;
        toast({
          title: `${outcome.abilityLabel} activée`,
          description: countdownInfo,
        });
      } else {
        switch (outcome.reason) {
          case 'occupied':
            toast({
              title: 'Case occupée',
              description: 'Sélectionne une case libre pour déclencher cette capacité.',
              variant: 'destructive',
            });
            break;
          case 'duplicate':
            toast({
              title: 'Zone déjà piégée',
              description: 'Une charge spéciale existe déjà sur cette case.',
              variant: 'destructive',
            });
            break;
          case 'invalid':
            toast({
              title: 'Coordonnée invalide',
              description: 'Choisis une case valide du plateau pour utiliser cette capacité.',
              variant: 'destructive',
            });
            break;
          case 'state':
            toast({
              title: 'Capacité indisponible',
              description: "Cette capacité ne peut pas être utilisée pour le moment.",
              variant: 'destructive',
            });
            break;
          default:
            break;
        }
      }

      return outcome;
    },
    [toast],
  );

  const tryInstantAbility = useCallback(
    (ability: SpecialAbilityOption): boolean => {
      const selectedPiece = gameState.selectedPiece;
      if (!selectedPiece) {
        toast({
          title: 'Sélectionnez une pièce',
          description: `Choisissez d'abord une pièce alliée pour activer ${ability.label.toLowerCase()}.`,
          variant: 'destructive',
        });
        return false;
      }

      const sourceRule = gameState.activeRules.find(rule => rule.ruleId === ability.ruleId);
      const abilityEffect = sourceRule?.effects.find(effect => {
        if (effect.action !== 'addAbility') return false;
        const declaredAbility = typeof effect.parameters?.ability === 'string' ? effect.parameters.ability : undefined;
        return declaredAbility === ability.ability;
      });
      const parameters = abilityEffect?.parameters ?? {};

      const allowedPiecesRaw = Array.isArray(parameters.allowedPieces) ? parameters.allowedPieces : [];
      const allowedPieces: PieceType[] = allowedPiecesRaw
        .map(value => (typeof value === 'string' ? value.toLowerCase() : ''))
        .filter(isPieceType);

      if (allowedPieces.length > 0 && !allowedPieces.includes(selectedPiece.type)) {
        const formatted = formatPieceList(allowedPieces);
        toast({
          title: 'Pièce incompatible',
          description: `${ability.label} se déclenche avec ${formatted}.`,
          variant: 'destructive',
        });
        return false;
      }

      let allowOccupied = false;
      let target: Position | null = null;

      switch (ability.ability) {
        case 'deployMine':
          target = { ...selectedPiece.position };
          allowOccupied = true;
          break;
        case 'deployBomb': {
          const maxDistanceParam = typeof parameters.maxDistance === 'number'
            ? parameters.maxDistance
            : typeof parameters.range === 'number'
              ? parameters.range
              : undefined;
          const maxDistance = Number.isFinite(maxDistanceParam) ? Math.max(1, Math.floor(maxDistanceParam)) : 2;
          const minDistanceParam = typeof parameters.minDistance === 'number' ? parameters.minDistance : undefined;
          const minDistance = Number.isFinite(minDistanceParam) ? Math.max(1, Math.floor(minDistanceParam)) : 1;
          const board = gameState.board;
          const direction = selectedPiece.color === 'white' ? -1 : 1;

          for (let distance = maxDistance; distance >= minDistance; distance--) {
            const candidate: Position = {
              row: selectedPiece.position.row + direction * distance,
              col: selectedPiece.position.col,
            };
            if (!ChessEngine.isValidPosition(candidate)) continue;
            if (!ChessEngine.getPieceAt(board, candidate)) {
              target = candidate;
              break;
            }
          }

          if (!target) {
            target = { ...selectedPiece.position };
            allowOccupied = true;
          }
          break;
        }
        default:
          return false;
      }

      if (!target) {
        return false;
      }

      const result = deploySpecialAttack(ability, target, { allowOccupied, clearSelection: false });
      return result.success;
    },
    [deploySpecialAttack, gameState.activeRules, gameState.board, gameState.selectedPiece, toast],
  );

  const handleSpecialAction = useCallback((ability: SpecialAbilityOption) => {
    const instantSuccess = tryInstantAbility(ability);
    if (instantSuccess) {
      setPendingAbility(null);
      return;
    }

    setPendingAbility(prev => {
      if (prev?.id === ability.id) {
        toast({
          title: 'Sélection annulée',
          description: `La capacité ${ability.label} est désactivée.`,
        });
        return null;
      }

      const instruction =
        ability.trigger === 'countdown'
          ? `Détonation dans ${ability.countdown} tour${ability.countdown > 1 ? 's' : ''}.`
          : 'Clique ensuite sur la case à piéger.';

      const description = `${instruction} ${ability.description}`.trim();

      toast({
        title: `${ability.label} prête`,
        description,
      });

      return ability;
    });
  }, [toast, tryInstantAbility]);

  useEffect(() => {
    if (pendingAbility && !specialAbilities.some(ability => ability.id === pendingAbility.id)) {
      setPendingAbility(null);
    }
  }, [pendingAbility, specialAbilities]);

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
  const countdownAudioRef = useRef<Record<string, number>>({});
  const pendingVisualEffectsTimeoutsRef = useRef<Record<string, number>>({});
  const seenVisualEffectsRef = useRef<Set<string>>(new Set());

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
    const interval = window.setInterval(() => {
      const detonated: GameState['specialAttacks'] = [];

      setGameState(prev => {
        if (!prev.specialAttacks.some(attack => attack.trigger === 'countdown')) {
          return prev;
        }

        let changed = false;
        const updatedAttacks: GameState['specialAttacks'] = [];
        let visualEffects = prev.visualEffects;
        const eventsSet = new Set(prev.events ?? []);
        const freezeApplications: FreezeApplication[] = [];

        prev.specialAttacks.forEach(attack => {
          if (attack.trigger !== 'countdown') {
            updatedAttacks.push(attack);
            return;
          }

          if (attack.remaining > 1) {
            changed = true;
            updatedAttacks.push({ ...attack, remaining: attack.remaining - 1 });
            return;
          }

          changed = true;
          detonated.push(attack);
          visualEffects = [
            ...visualEffects,
            {
              id: `${attack.id}-explosion-${Date.now()}`,
              type: 'explosion',
              position: attack.position,
              radius: attack.radius,
              animation: attack.animation,
              durationMs: 900,
              startedAt: Date.now(),
              ability: attack.ability,
              ruleName: attack.ruleName,
              notify: false,
            },
          ];
          const abilitySound = attack.sound as SoundEffect;
          eventsSet.add(abilitySound);

          if (attack.ability === 'freezeMissile') {
            const turns = Math.max(1, attack.freezeTurns ?? 2);
            const targetColor: PieceColor = attack.owner === 'white' ? 'black' : 'white';
            const affected = collectPiecesWithinRadius(prev.board, attack.position, attack.radius, targetColor);
            if (affected.length > 0) {
              freezeApplications.push({ color: targetColor, positions: affected, turns });
            }
          }
        });

        if (!changed) {
          return prev;
        }

        let freezeEffects = prev.freezeEffects;
        if (freezeApplications.length > 0) {
          freezeEffects = mergeFreezeEffects(
            prev.freezeEffects.map(effect => ({ ...effect })),
            prev.board,
            freezeApplications
          );
        }

        return {
          ...prev,
          specialAttacks: updatedAttacks,
          visualEffects,
          events: Array.from(eventsSet),
          freezeEffects,
        };
      });

      if (detonated.length > 0) {
        detonated.forEach(attack => {
          const metadata = getSpecialAbilityMetadata(attack.ability);
          const coordinate = `${FILES[attack.position.col] ?? '?'}${8 - attack.position.row}`;
          toast({
            title: `${metadata?.label ?? 'Explosion'} déclenchée`,
            description: `La charge posée sur ${coordinate} s'est déclenchée.`,
          });
          delete countdownAudioRef.current[attack.id];
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [toast]);

  useEffect(() => {
    const store = countdownAudioRef.current;
    const activeIds = new Set(gameState.specialAttacks.map(attack => attack.id));

    Object.keys(store).forEach(id => {
      if (!activeIds.has(id)) {
        delete store[id];
      }
    });

    gameState.specialAttacks.forEach(attack => {
      if (attack.trigger !== 'countdown') {
        delete store[attack.id];
        return;
      }

      if (attack.remaining <= 0) {
        delete store[attack.id];
        return;
      }

      if (attack.remaining <= 3) {
        if (store[attack.id] !== attack.remaining) {
          store[attack.id] = attack.remaining;
          if (soundEnabled) {
            void playSound('countdown');
          }
        }
      } else {
        store[attack.id] = attack.remaining;
      }
    });
  }, [gameState.specialAttacks, playSound, soundEnabled]);

  useEffect(() => {
    const timeouts = pendingVisualEffectsTimeoutsRef.current;
    const activeIds = new Set(gameState.visualEffects.map(effect => effect.id));

    Object.entries(timeouts).forEach(([id, handle]) => {
      if (!activeIds.has(id)) {
        window.clearTimeout(handle);
        delete timeouts[id];
      }
    });

    gameState.visualEffects.forEach(effect => {
      if (timeouts[effect.id]) return;
      const timeout = window.setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          visualEffects: prev.visualEffects.filter(item => item.id !== effect.id),
        }));
        delete timeouts[effect.id];
      }, effect.durationMs ?? 900);
      timeouts[effect.id] = timeout;
    });
  }, [gameState.visualEffects]);

  useEffect(() => {
    const seen = seenVisualEffectsRef.current;
    const activeIds = new Set(gameState.visualEffects.map(effect => effect.id));

    Array.from(seen).forEach(id => {
      if (!activeIds.has(id)) {
        seen.delete(id);
      }
    });

    gameState.visualEffects.forEach(effect => {
      if (seen.has(effect.id)) return;
      seen.add(effect.id);
      if (effect.notify && effect.ability) {
        const metadata = getSpecialAbilityMetadata(effect.ability);
        const coordinate = `${FILES[effect.position.col] ?? '?'}${8 - effect.position.row}`;
        toast({
          title: `${metadata?.label ?? 'Explosion'} déclenchée`,
          description: effect.ruleName
            ? `${effect.ruleName} a explosé sur ${coordinate}.`
            : `Une explosion s'est produite sur ${coordinate}.`,
        });
      }
    });
  }, [gameState.visualEffects, toast]);

  useEffect(() => () => {
    Object.values(pendingVisualEffectsTimeoutsRef.current).forEach(handle => {
      window.clearTimeout(handle);
    });
    pendingVisualEffectsTimeoutsRef.current = {};
  }, []);
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

    const originPosition: Position = { ...selectedPiece.position };
    const move = ChessEngine.createMove(state.board, selectedPiece, destination, state);
    move.timestamp = new Date().toISOString();
    move.durationMs = typeof selectionDuration === 'number' ? selectionDuration : null;
    const events: SoundEffect[] = [];
    let updatedSpecialAttacks = state.specialAttacks.map(attack => ({ ...attack }));
    const pendingFreezeApplications: FreezeApplication[] = [];
    let updatedVisualEffects = [...state.visualEffects];

    let pendingTransformations = { ...state.pendingTransformations };
    if (hasRule('preset_vip_magnus_06') && pendingTransformations[state.currentPlayer] && selectedPiece.type === 'pawn') {
      move.promotion = move.promotion ?? 'knight';
      pendingTransformations = { ...pendingTransformations, [state.currentPlayer]: false };
    }

    const newBoard = ChessEngine.executeMove(state.board, move, state);

    if (updatedSpecialAttacks.length > 0) {
      const remainingAttacks: typeof updatedSpecialAttacks = [];
      const triggeredSounds = new Set<SoundEffect>();

      updatedSpecialAttacks.forEach(attack => {
        if (
          attack.trigger === 'contact' &&
          attack.owner !== state.currentPlayer &&
          attack.position.row === move.to.row &&
          attack.position.col === move.to.col
        ) {
          triggeredSounds.add(attack.sound as SoundEffect);
          updatedVisualEffects = [
            ...updatedVisualEffects,
            {
              id: `${attack.id}-contact-${Date.now()}`,
              type: 'explosion',
              position: attack.position,
              radius: attack.radius,
              animation: attack.animation,
              durationMs: 900,
              startedAt: Date.now(),
              ability: attack.ability,
              ruleName: attack.ruleName,
              notify: true,
            },
          ];

          if (attack.ability === 'freezeMissile') {
            const turns = Math.max(1, attack.freezeTurns ?? 2);
            const targetColor: PieceColor = state.currentPlayer;
            const affected = collectPiecesWithinRadius(newBoard, attack.position, attack.radius, targetColor);
            if (affected.length > 0) {
              pendingFreezeApplications.push({ color: targetColor, positions: affected, turns });
            }
          }
        } else {
          remainingAttacks.push(attack);
        }
      });

      updatedSpecialAttacks = remainingAttacks;
      if (triggeredSounds.size > 0) {
        triggeredSounds.forEach(sound => {
          if (!events.includes(sound)) {
            events.push(sound);
          }
        });
      }
    }

    const addVisualEffect = (effect: VisualEffect, sound?: SoundEffect) => {
      updatedVisualEffects = [...updatedVisualEffects, effect];
      if (sound && !events.includes(sound)) {
        events.push(sound);
      }
    };

    state.activeRules.forEach(rule => {
      if (!rule.isActive) return;

      const appliesToMover = ruleTargetsPiece(rule, selectedPiece);
      const appliesToCaptured = ruleTargetsPiece(rule, move.captured ?? null);

      rule.effects.forEach(effect => {
        const params = effect.parameters ?? {};
        switch (effect.action) {
          case 'areaExplosion': {
            if (!move.captured) return;
            if (!appliesToCaptured && !appliesToMover) {
              return;
            }
            if (!['onCapture', 'always', 'conditional'].includes(rule.trigger)) return;

            const radius = Math.max(1, toPositiveNumber(params.radius, 1));
            const animation = toAnimationName(params.animation, 'explosion');
            const durationMs = Math.max(400, toPositiveNumber(params.durationMs, 900));
            const sound = toSoundEffect(params.sound, 'explosion');
            const position = { ...move.to };
            addVisualEffect({
              id: `${rule.ruleId}-explosion-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'explosion',
              position,
              radius,
              animation,
              durationMs,
              startedAt: Date.now(),
              ability: undefined,
              ruleName: rule.ruleName,
              notify: true,
            }, sound);
            break;
          }
          case 'createHologram': {
            if (!appliesToMover) return;
            if (!['onMove', 'always', 'conditional'].includes(rule.trigger)) return;
            const animation = toAnimationName(params.animation, 'hologram');
            const durationMs = Math.max(400, toPositiveNumber(params.durationMs, 1200));
            const radius = Math.max(1, toPositiveNumber(params.radius, 1));
            addVisualEffect({
              id: `${rule.ruleId}-hologram-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'projection',
              position: { ...move.to },
              radius,
              animation,
              durationMs,
              startedAt: Date.now(),
              ability: undefined,
              ruleName: rule.ruleName,
              notify: false,
            });
            break;
          }
          case 'leavePhantom': {
            if (!appliesToMover) return;
            if (!['onMove', 'always', 'conditional'].includes(rule.trigger)) return;
            const animation = toAnimationName(params.animation, 'ghost-veil');
            const durationMs = Math.max(400, toPositiveNumber(params.durationMs, 1000));
            const radius = Math.max(1, toPositiveNumber(params.radius, 1));
            addVisualEffect({
              id: `${rule.ruleId}-phantom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'phantom',
              position: { ...originPosition },
              radius,
              animation,
              durationMs,
              startedAt: Date.now(),
              ability: undefined,
              ruleName: rule.ruleName,
              notify: false,
            });
            break;
          }
          default:
            break;
        }
      });
    });

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

    if (pendingFreezeApplications.length > 0) {
      freezeEffects = mergeFreezeEffects(freezeEffects, newBoard, pendingFreezeApplications);
    }

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
      blindOpeningRevealed,
      specialAttacks: updatedSpecialAttacks,
      visualEffects: updatedVisualEffects,
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
      specialAttacks: updatedSpecialAttacks,
      visualEffects: updatedVisualEffects,
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

    const prioritized: SoundEffect[] = [
      'checkmate',
      'check',
      'quantum-explosion',
      'mine-detonation',
      'explosion',
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

    if (pendingAbility) {
      const result = deploySpecialAttack(pendingAbility, position, { clearSelection: true });
      if (result.success) {
        setPendingAbility(null);
      }
      return;
    }

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
    setPendingAbility(null);
    countdownAudioRef.current = {};
    Object.values(pendingVisualEffectsTimeoutsRef.current).forEach(handle => window.clearTimeout(handle));
    pendingVisualEffectsTimeoutsRef.current = {};
    seenVisualEffectsRef.current.clear();
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
      blindOpeningRevealed: { white: false, black: false },
      specialAttacks: [],
      visualEffects: [],
      events: [],
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

  const showWaitingOverlay = opponentType === 'player' && waitingForOpponent;

  const headerBadges = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge className="border-cyan-500/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-cyan-200">
        Mode : {opponentType === 'ai' ? 'IA' : opponentType === 'local' ? 'Local' : 'Multijoueur en ligne'}
      </Badge>
      <Badge className="border-cyan-400/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-cyan-200">
        Temps : {timeControl === 'untimed' ? 'Sans limite' : timeControlSettings.label}
      </Badge>
      {opponentType === 'player' && currentLobbyRole && (
        <Badge className="border-fuchsia-400/40 bg-black/50 text-[0.65rem] uppercase tracking-[0.25em] text-fuchsia-200">
          {currentLobbyRole === 'creator' ? 'Hôte' : 'Adversaire'}
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
      {opponentType === 'player' && currentLobbyName && (
        <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">Lobby : {currentLobbyName}</Badge>
      )}
      {opponentType === 'player' && currentOpponentName && (
        <Badge className="border-white/20 bg-white/5 px-3 py-1 text-[0.7rem] font-semibold text-white/80">Adversaire : {currentOpponentName}</Badge>
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
        {showWaitingOverlay && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
            <Loader2 className="h-9 w-9 animate-spin text-cyan-200" />
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100">En attente de joueur</p>
            <p className="text-xs text-cyan-100/70">Nous te connectons à un adversaire dès qu’il rejoint la table.</p>
          </div>
        )}
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
                          {specialAbilities.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              {specialAbilities.map(ability => {
                                const Icon = ABILITY_ICON_MAP[ability.icon] ?? Rocket;
                                const isSelected = pendingAbility?.id === ability.id;
                                const info = ability.trigger === 'countdown'
                                  ? `Détonation dans ${ability.countdown} tour${ability.countdown > 1 ? 's' : ''}`
                                  : 'Détonation au contact';
                                const impact = ability.freezeTurns
                                  ? `Gel ${ability.freezeTurns} tour${ability.freezeTurns > 1 ? 's' : ''}`
                                  : `Impact ${ability.damage}`;
                                return (
                                  <Button
                                    key={ability.id}
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleSpecialAction(ability)}
                                    className={cn(
                                      'flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition-all duration-200',
                                      isSelected
                                        ? 'border-fuchsia-200/70 bg-fuchsia-500/20 text-fuchsia-100 shadow-[0_0_18px_rgba(244,114,182,0.4)]'
                                        : 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-200 hover:bg-fuchsia-500/20 hover:text-white'
                                    )}
                                    title={`${ability.label} · Rayon ${ability.radius} · ${info} · ${impact}`}
                                  >
                                    <Icon className="h-4 w-4" />
                                    {ability.buttonLabel ?? ability.label}
                                  </Button>
                                );
                              })}
                            </div>
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
                      {pendingAbility && (
                        <div className="absolute -top-9 left-1/2 z-20 -translate-x-1/2 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/20 px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-fuchsia-100 shadow-[0_0_25px_rgba(236,72,153,0.35)]">
                          Cliquez sur une case vide pour {pendingAbility.buttonLabel?.toLowerCase() ?? pendingAbility.label.toLowerCase()}
                        </div>
                      )}
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



