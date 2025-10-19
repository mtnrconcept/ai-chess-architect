/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/Play.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Bomb,
  Bot,
  Loader2,
  Menu,
  MessageSquareText,
  Rocket,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ChessBoard from "@/components/ChessBoard";
import { ChessEngine } from "@/lib/chessEngine";
import {
  GameState,
  Position,
  ChessPiece,
  ChessRule,
  PieceColor,
  ChessMove,
  SpecialAttackInstance,
  PieceType,
  VisualEffect,
} from "@/types/chess";
import { allPresetRules } from "@/lib/presetRules";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { analyzeRuleLogic } from "@/lib/ruleValidation";
import { getCategoryColor } from "@/lib/ruleCategories";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseFunctionErrorMessage } from "@/integrations/supabase/errors";
import { buildCoachFallbackMessage } from "@/lib/coachFallback";
// import { useToast } from '@/hooks/use-toast'; // ⚠️ NE PLUS UTILISER DIRECTEMENT
import { cn } from "@/lib/utils";
import { CoachChatMessage, CoachChatResponse } from "@/types/coach";
import {
  TIME_CONTROL_SETTINGS,
  type TimeControlOption,
  isTimeControlOption,
} from "@/types/timeControl";
import { useSoundEffects, type SoundEffect } from "@/hooks/useSoundEffects";
import {
  getSpecialAbilityMetadata,
  normalizeSpecialAbilityParameters,
  resolveSpecialAbilityName,
  type SpecialAbilityActivation,
  type SpecialAbilityKey,
  type SpecialAbilityTrigger,
} from "@/lib/specialAbilities";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useAuth } from "@/contexts/AuthContext";
import {
  analyzeCompletedGame,
  deserializeBoardState,
  formatMoveNotation,
  serializeBoardState,
} from "@/lib/postGameAnalysis";
import { saveCompletedGame } from "@/lib/gameStorage";
import {
  fetchTournamentMatch,
  requestTournamentMatch,
} from "@/lib/tournamentApi";
import {
  loadPresetRulesFromDatabase,
  convertRuleJsonToChessRule,
} from "@/lib/presetRulesAdapter";
import { useRuleEngine } from "@/hooks/useRuleEngine";
import { FxProvider, useFxTrigger } from "@/fx/context";
import type { RuleJSON } from "@/engine/types";

/* -------------------------------------------------------------------------- */
/*                               Helpers locaux                               */
/* -------------------------------------------------------------------------- */

/** Garantit que le toast s’affiche après le commit React (pas pendant le render) */
import { useToast } from "@/hooks/use-toast";
function useSafeToast() {
  const { toast } = useToast();
  return useCallback(
    (opts: Parameters<typeof toast>[0]) => {
      // rAF décale la mise à jour du Toaster après le commit
      requestAnimationFrame(() => toast(opts));
    },
    [toast],
  );
}

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const readErrorResponseText = async (
  value: unknown,
): Promise<string | undefined> => {
  const container = toRecord(value);
  const context =
    container?.context && typeof container.context === "object"
      ? (container.context as Record<string, unknown>)
      : undefined;
  if (!context) return undefined;

  const response =
    context.response && typeof context.response === "object"
      ? (context.response as Record<string, unknown>)
      : undefined;
  if (!response) return undefined;

  const textFn =
    typeof response.text === "function"
      ? (response.text as () => Promise<string>)
      : undefined;
  if (!textFn) return undefined;

  try {
    return await textFn.call(response);
  } catch {
    return undefined;
  }
};

const createChatMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
};

const createWelcomeMessage = (): CoachChatMessage => ({
  id: createChatMessageId(),
  role: "system",
  content:
    "Le coach conversationnel est prêt. Jouez un coup ou posez une question pour lancer l'analyse.",
  createdAt: new Date().toISOString(),
  trigger: "initial",
});

const isCarnivorousPlantRule = (rule: ChessRule): boolean => {
  const id = rule.ruleId.toLowerCase();
  const name = rule.ruleName.toLowerCase();
  const normalizedId = id.replace(/[^a-z0-9]/g, "");
  const normalizedName = name.replace(/[^a-z0-9]/g, "");
  return (
    (normalizedId.includes("plante") && normalizedId.includes("carniv")) ||
    (normalizedName.includes("plante") && normalizedName.includes("carniv"))
  );
};

const FILES = "abcdefgh";
const AI_COLOR: PieceColor = "black";
const HUMAN_COLOR: PieceColor = "white";

const PIECE_WEIGHTS: Record<ChessPiece["type"], number> = {
  king: 20000,
  queen: 900,
  rook: 500,
  bishop: 330,
  knight: 320,
  pawn: 100,
};
const PIECE_TYPES: PieceType[] = [
  "king",
  "queen",
  "rook",
  "bishop",
  "knight",
  "pawn",
];
const PIECE_TYPE_LABELS: Record<PieceType, string> = {
  king: "le roi",
  queen: "la reine",
  rook: "la tour",
  bishop: "le fou",
  knight: "le cavalier",
  pawn: "le pion",
};
const isPieceType = (v: unknown): v is PieceType =>
  typeof v === "string" && PIECE_TYPES.includes(v as PieceType);

const formatPieceList = (pieces: PieceType[]): string => {
  if (pieces.length === 0) return "";
  const labels = pieces.map((p) => PIECE_TYPE_LABELS[p]);
  if (labels.length === 1) return labels[0];
  const head = labels.slice(0, -1).join(", ");
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
  for (
    let row = Math.max(0, center.row - radius);
    row <= Math.min(7, center.row + radius);
    row++
  ) {
    for (
      let col = Math.max(0, center.col - radius);
      col <= Math.min(7, center.col + radius);
      col++
    ) {
      const dRow = Math.abs(row - center.row);
      const dCol = Math.abs(col - center.col);
      if (Math.max(dRow, dCol) > radius) continue;
      const target = ChessEngine.getPieceAt(board, { row, col });
      if (target && target.color === color) affected.push({ row, col });
    }
  }
  return affected;
};

const mergeFreezeEffects = (
  current: GameState["freezeEffects"],
  board: (ChessPiece | null)[][],
  applications: FreezeApplication[],
): GameState["freezeEffects"] => {
  if (applications.length === 0) return current;
  const updated = current.map((e) => ({ ...e }));
  applications.forEach(({ color, positions, turns }) => {
    positions.forEach((position) => {
      const target = ChessEngine.getPieceAt(board, position);
      if (!target || target.color !== color) return;
      const idx = updated.findIndex(
        (e) =>
          e.color === color &&
          e.position.row === position.row &&
          e.position.col === position.col,
      );
      if (idx >= 0) {
        if (updated[idx].remainingTurns < turns)
          updated[idx] = { ...updated[idx], remainingTurns: turns };
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

const AI_MOVE_DELAY_RANGES: Record<
  TimeControlOption,
  { min: number; max: number }
> = {
  bullet: { min: 500, max: 3000 },
  blitz: { min: 2000, max: 5000 },
  long: { min: 1000, max: 10000 },
  untimed: { min: 1000, max: 10000 },
};

type AIDifficulty = "novice" | "standard" | "expert";
const AI_DIFFICULTY_LEVELS: Record<
  AIDifficulty,
  { depth: number; label: string; description: string; selectionRange: number }
> = {
  novice: {
    depth: 1,
    label: "Débutant",
    description:
      "Vision limitée et choix parfois aventureux pour un entraînement détendu.",
    selectionRange: 3,
  },
  standard: {
    depth: 2,
    label: "Intermédiaire",
    description: "Équilibre entre temps de réflexion et précision stratégique.",
    selectionRange: 2,
  },
  expert: {
    depth: 3,
    label: "Maître",
    description: "Recherche profonde et coups optimisés pour un vrai défi.",
    selectionRange: 1,
  },
};
const isAIDifficulty = (v: string): v is AIDifficulty =>
  v in AI_DIFFICULTY_LEVELS;

type AiMoveResolver = (
  state: GameState,
) => { from: Position; to: Position } | null;

const CAPTURED_PIECE_SYMBOLS: Record<
  ChessPiece["type"],
  { white: string; black: string }
> = {
  king: { white: "♔", black: "♚" },
  queen: { white: "♕", black: "♛" },
  rook: { white: "♖", black: "♜" },
  bishop: { white: "♗", black: "♝" },
  knight: { white: "♘", black: "♞" },
  pawn: { white: "♙", black: "♟" },
};

const ABILITY_ICON_MAP: Record<string, LucideIcon> = {
  bomb: Bomb,
  target: Target,
};

const SPECIAL_SOUND_EFFECTS: readonly SoundEffect[] = [
  "explosion",
  "quantum-explosion",
  "mine-detonation",
] as const;
const toSoundEffect = (v: unknown, fb: SoundEffect): SoundEffect =>
  typeof v === "string" &&
  (SPECIAL_SOUND_EFFECTS as readonly string[]).includes(v)
    ? (v as SoundEffect)
    : fb;
const toPositiveNumber = (v: unknown, fb: number): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const parsed = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(parsed) ? parsed : fb;
};
const toAnimationName = (v: unknown, fb: string): string =>
  typeof v === "string" && v.trim().length > 0 ? v : fb;

const ruleTargetsPiece = (
  rule: ChessRule,
  piece: ChessPiece | null,
): boolean => {
  if (!piece) return false;
  if (rule.affectedPieces.length === 0) return true;
  return (
    rule.affectedPieces.includes("all") ||
    rule.affectedPieces.includes(piece.type)
  );
};

interface SpecialAbilityOption {
  id: string;
  ruleId: string;
  ruleName: string;
  ability: SpecialAbilityKey;
  label: string;
  description: string;
  icon: "bomb" | "target";
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
  | { success: false; reason: "state" | "occupied" | "duplicate" | "invalid" };

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

const Play = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const safeToast = useSafeToast();
  const { play: playSfx } = useSoundEffects();

  const locationState = location.state as
    | {
        customRules?: ChessRule[];
        presetRuleIds?: string[];
        opponentType?: "ai" | "player" | "local";
        lobbyId?: string;
        role?: "creator" | "opponent";
        lobbyName?: string;
        opponentName?: string;
        playerName?: string;
        timeControl?: TimeControlOption;
        playerElo?: number;
        opponentElo?: number;
        matchId?: string;
        matchStatus?: string;
        tournamentId?: string;
      }
    | undefined;

  const params = useParams<{ matchId?: string }>();

  const opponentType =
    locationState?.opponentType === "player"
      ? "player"
      : locationState?.opponentType === "local"
        ? "local"
        : "ai";

  const lobbyId =
    typeof locationState?.lobbyId === "string"
      ? locationState.lobbyId
      : undefined;
  const initialLobbyRole =
    locationState?.role === "creator" || locationState?.role === "opponent"
      ? locationState.role
      : undefined;
  const initialLobbyName =
    typeof locationState?.lobbyName === "string"
      ? locationState.lobbyName
      : undefined;
  const initialOpponentName =
    typeof locationState?.opponentName === "string"
      ? locationState.opponentName
      : undefined;
  const playerName =
    typeof locationState?.playerName === "string"
      ? locationState.playerName
      : undefined;
  const routeMatchId =
    typeof params.matchId === "string" ? params.matchId : undefined;
  const stateMatchId =
    typeof locationState?.matchId === "string"
      ? locationState.matchId
      : undefined;
  const matchId = stateMatchId ?? routeMatchId;
  const tournamentId =
    typeof locationState?.tournamentId === "string"
      ? locationState.tournamentId
      : undefined;
  const initialMatchStatus =
    typeof locationState?.matchStatus === "string"
      ? locationState.matchStatus
      : null;

  const [currentLobbyRole, setCurrentLobbyRole] =
    useState<typeof initialLobbyRole>(initialLobbyRole);
  const [currentLobbyName, setCurrentLobbyName] = useState<string | undefined>(
    initialLobbyName,
  );
  const [currentOpponentName, setCurrentOpponentName] = useState<
    string | undefined
  >(initialOpponentName);
  const [matchStatus, setMatchStatus] = useState<string | null>(
    initialMatchStatus,
  );
  const [waitingForOpponent, setWaitingForOpponent] = useState<boolean>(
    () =>
      opponentType === "player" &&
      (initialMatchStatus === "pending" ||
        (!!initialLobbyRole &&
          initialLobbyRole === "creator" &&
          !initialOpponentName)),
  );

  useEffect(() => setCurrentLobbyRole(initialLobbyRole), [initialLobbyRole]);
  useEffect(() => setCurrentLobbyName(initialLobbyName), [initialLobbyName]);
  useEffect(
    () => setCurrentOpponentName(initialOpponentName),
    [initialOpponentName],
  );

  useEffect(() => {
    setMatchStatus(initialMatchStatus);
    if (opponentType === "player") {
      const shouldWait =
        initialMatchStatus === "pending" ||
        (!!initialLobbyRole &&
          initialLobbyRole === "creator" &&
          !initialOpponentName);
      setWaitingForOpponent(shouldWait);
    }
  }, [initialMatchStatus, opponentType, initialLobbyRole, initialOpponentName]);

  const playerDisplayName = playerName ?? "Vous";
  const opponentDisplayName =
    currentOpponentName ??
    (opponentType === "ai"
      ? "Cyber IA"
      : opponentType === "local"
        ? "Joueur local"
        : "Adversaire inconnu");
  const playerElo =
    typeof locationState?.playerElo === "number"
      ? locationState.playerElo
      : 1500;
  const opponentElo =
    typeof locationState?.opponentElo === "number"
      ? locationState.opponentElo
      : opponentType === "ai"
        ? 1800
        : 1500;

  const timeControl: TimeControlOption = isTimeControlOption(
    locationState?.timeControl,
  )
    ? locationState.timeControl
    : "untimed";
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
      console.error("[play] unable to attach AI fallback", error);
      safeToast({
        title: "Matchmaking",
        description: "Impossible de lancer la partie contre l'IA.",
        variant: "destructive",
      });
    }
  }, [playerDisplayName, safeToast, tournamentId]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const fallbackHost = initialLobbyRole === "creator";

    const syncMatchDetails = async () => {
      try {
        const details = await fetchTournamentMatch(matchId);
        if (!details || cancelled) return;

        setMatchStatus(details.status ?? null);

        if (details.lobby?.name) setCurrentLobbyName(details.lobby.name);
        if (details.is_ai_match) {
          setCurrentOpponentName(details.ai_opponent_label ?? "Voltus AI");
        } else if (details.lobby?.opponent_name) {
          setCurrentOpponentName(details.lobby.opponent_name);
        }

        if (user?.id) {
          if (details.player1_id === user.id) setCurrentLobbyRole("creator");
          else if (details.player2_id === user.id)
            setCurrentLobbyRole("opponent");
        }

        const hostId = details.player1_id ?? null;
        const isHost = user?.id ? user.id === hostId : fallbackHost;
        if (opponentType === "player")
          setWaitingForOpponent(
            (details.status ?? null) === "pending" && !!isHost,
          );
      } catch (error) {
        console.error("[play] unable to synchroniser le match", error);
      }
    };

    void syncMatchDetails();

    const channel = supabase
      .channel(`tournament-match-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournament_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as {
            status?: string;
            player1_id?: string;
            player2_id?: string;
            is_ai_match?: boolean | null;
            ai_opponent_label?: string | null;
          };
          const updatedStatus = updated?.status ?? null;
          setMatchStatus(updatedStatus);

          if (user?.id) {
            if (updated?.player1_id === user.id) setCurrentLobbyRole("creator");
            else if (updated?.player2_id === user.id)
              setCurrentLobbyRole("opponent");
          }

          const isHost = user?.id
            ? updated?.player1_id === user.id
            : fallbackHost;
          if (opponentType === "player")
            setWaitingForOpponent(updatedStatus === "pending" && !!isHost);

          if (updated?.is_ai_match && updated.ai_opponent_label)
            setCurrentOpponentName(updated.ai_opponent_label);

          if (updatedStatus === "playing" || updatedStatus === "finished")
            void syncMatchDetails();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [matchId, opponentType, user?.id, initialLobbyRole]);

  const rawCustomRules = useMemo(() => {
    const custom = locationState?.customRules;
    return Array.isArray(custom)
      ? (custom as ChessRule[])
      : ([] as ChessRule[]);
  }, [locationState]);

  const initialPresetRuleIds = useMemo(() => {
    const preset = locationState?.presetRuleIds;
    if (!Array.isArray(preset)) return [] as string[];
    return preset.filter(
      (ruleId): ruleId is string =>
        typeof ruleId === "string" && ruleId.length > 0,
    );
  }, [locationState]);

  const analyzedCustomRules = useMemo(
    () => (rawCustomRules || []).map((rule) => analyzeRuleLogic(rule).rule),
    [rawCustomRules],
  );

  const [dbLoadedRules, setDbLoadedRules] = useState<ChessRule[]>([]);
  const [dbRulesLoaded, setDbRulesLoaded] = useState(false);

  useEffect(() => {
    const loadDbRules = async () => {
      try {
        const presetRules = await loadPresetRulesFromDatabase();

        const aiRules: ChessRule[] = [];
        if (user?.id) {
          const { data: rulesData, error } = await supabase
            .from("chess_rules")
            .select("rule_json")
            .eq("status", "active")
            .eq("created_by", user.id)
            .in("source", ["custom", "ai_generated"]);

          if (!error && rulesData) {
            rulesData.forEach((row) => {
              if (row.rule_json) {
                try {
                  const converted = convertRuleJsonToChessRule(row.rule_json);
                  aiRules.push(converted);
                } catch (err) {
                  console.warn("[Play] Failed to convert AI rule", err);
                }
              }
            });
          }
        }

        setDbLoadedRules([...presetRules, ...aiRules]);
        setDbRulesLoaded(true);
      } catch (error) {
        console.error("[Play] Failed to load DB rules", error);
        setDbLoadedRules(allPresetRules);
        setDbRulesLoaded(true);
      }
    };

    loadDbRules();
  }, [user?.id]);

  const [customRules, setCustomRules] =
    useState<ChessRule[]>(analyzedCustomRules);
  const activePresetRule = useMemo(() => {
    if (initialPresetRuleIds.length === 0 || !dbRulesLoaded) return null;
    const [firstRuleId] = initialPresetRuleIds;
    return dbLoadedRules.find((rule) => rule.ruleId === firstRuleId) ?? null;
  }, [initialPresetRuleIds, dbLoadedRules, dbRulesLoaded]);
  const appliedPresetRuleIds = useMemo(
    () => new Set(initialPresetRuleIds),
    [initialPresetRuleIds],
  );
  const primaryRule = customRules[0] ?? activePresetRule ?? null;
  const variantName = primaryRule?.ruleName ?? "Standard";
  const activeCustomRulesCount = customRules.length;

  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("ai-difficulty");
      if (stored && isAIDifficulty(stored)) return stored;
    }
    return "standard";
  });
  const aiDifficultyMeta = AI_DIFFICULTY_LEVELS[aiDifficulty];
  const aiSearchDepth = Math.max(1, aiDifficultyMeta.depth);

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false,
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [pendingAbility, setPendingAbility] =
    useState<SpecialAbilityOption | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
      currentPlayer: "white",
      turnNumber: 1,
      movesThisTurn: 0,
      selectedPiece: null,
      validMoves: [],
      gameStatus: "active",
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
    for (const piece of gameState.capturedPieces)
      grouped[piece.color].push(piece);
    return {
      white: [...grouped.white].sort(
        (a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type],
      ),
      black: [...grouped.black].sort(
        (a, b) => PIECE_WEIGHTS[b.type] - PIECE_WEIGHTS[a.type],
      ),
    };
  }, [gameState.capturedPieces]);

  const specialAbilities = useMemo<SpecialAbilityOption[]>(() => {
    const options: SpecialAbilityOption[] = [];
    const seen = new Set<string>();

    gameState.activeRules.forEach((rule) => {
      const ruleAsAny = rule as any;
      const originalJson = ruleAsAny.__originalRuleJson;
      if (!originalJson?.ui?.actions) return;

      originalJson.ui.actions.forEach((uiAction: any, index: number) => {
        if (!uiAction.id || !uiAction.id.startsWith("special_")) return;

        const id = `${rule.ruleId}-${uiAction.id}-${index}`;
        if (seen.has(id)) return;
        seen.add(id);

        const icon = uiAction.icon === "❄️" ? "target" : "bomb";
        const label = uiAction.label || uiAction.hint || "Action spéciale";
        const cooldown = uiAction.cooldown?.perPiece || 2;

        options.push({
          id,
          ruleId: rule.ruleId,
          ruleName: rule.ruleName,
          ability: "deployBomb" as SpecialAbilityKey,
          label,
          description: uiAction.hint || label,
          icon,
          trigger: "instant" as SpecialAbilityTrigger, // sera normé au moment du déploiement si besoin
          radius: 1,
          countdown: cooldown,
          damage: 100,
          animation: "explosion",
          sound: "explosion",
          buttonLabel: label,
          activation: "manual" as SpecialAbilityActivation,
          freezeTurns: 2,
          allowOccupied: false,
        });
      });
    });

    return options;
  }, [gameState.activeRules]);

  /* ------------------------------------------------------------------------ */
  /*      Déploiement d’aptitude spéciale — pas de toast dans setState        */
  /* ------------------------------------------------------------------------ */

  const deploySpecialAttack = useCallback(
    (
      ability: SpecialAbilityOption,
      position: Position,
      options?: { allowOccupied?: boolean; clearSelection?: boolean },
    ): DeployResult => {
      let result: DeployResult = { success: false, reason: "state" };

      setGameState((prev) => {
        if (
          ["checkmate", "stalemate", "draw", "timeout"].includes(
            prev.gameStatus,
          )
        ) {
          result = { success: false, reason: "state" };
          return prev;
        }

        if (!ChessEngine.isValidPosition(position)) {
          result = { success: false, reason: "invalid" };
          return prev;
        }

        const allowOccupied =
          ability.allowOccupied || options?.allowOccupied || false;
        const occupant = ChessEngine.getPieceAt(prev.board, position);
        if (occupant && !allowOccupied) {
          result = { success: false, reason: "occupied" };
          return prev;
        }

        const alreadyArmed = prev.specialAttacks.some(
          (a) =>
            a.position.row === position.row && a.position.col === position.col,
        );
        if (alreadyArmed) {
          result = { success: false, reason: "duplicate" };
          return prev;
        }

        const attackId = `${ability.ability}-${Date.now()}`;
        const next: GameState = {
          ...prev,
          specialAttacks: [
            ...prev.specialAttacks,
            {
              id: attackId,
              ability: ability.ability,
              position: { ...position },
              radius: Math.max(1, ability.radius || 1),
              trigger:
                ability.trigger === "countdown" || ability.trigger === "contact"
                  ? ability.trigger
                  : "countdown",
              countdown: Math.max(0, ability.countdown ?? 0),
              remaining: Math.max(0, ability.countdown ?? 0),
              damage: Math.max(1, ability.damage || 1),
              animation: ability.animation || "explosion",
              sound: ability.sound || "explosion",
              owner: prev.currentPlayer,
              armedAtTurn: prev.turnNumber,
            } satisfies SpecialAttackInstance,
          ],
        };

        const colLetter = FILES[position.col] ?? "?";
        const coordinate = `${colLetter}${8 - position.row}`;
        result = {
          success: true,
          coordinate,
          trigger: next.specialAttacks[next.specialAttacks.length - 1].trigger,
          countdown:
            next.specialAttacks[next.specialAttacks.length - 1].remaining,
          abilityLabel: ability.label ?? "Aptitude",
        };

        return next;
      });

      // ⚠️ Les toasts et SFX sont déclenchés **après** l’update, jamais dans l’updater
      if (result.success) {
        if (soundEnabled) playSfx(toSoundEffect(ability.sound, "explosion"));
        safeToast({
          title: "Aptitude déployée",
          description:
            result.trigger === "countdown"
              ? `${result.abilityLabel} sur ${result.coordinate} — explosion dans ${result.countdown} tours.`
              : `${result.abilityLabel} sur ${result.coordinate} — explosion au contact.`,
        });
      } else {
        const reasonLabel =
          result.reason === "occupied"
            ? "case déjà occupée"
            : result.reason === "duplicate"
              ? "une aptitude est déjà armée ici"
              : result.reason === "invalid"
                ? "case invalide"
                : "état de partie incompatible";
        safeToast({
          title: "Impossible d'armer l'aptitude",
          description: reasonLabel,
          variant: "destructive",
        });
      }

      return result;
    },
    [playSfx, safeToast, soundEnabled],
  );

  /* ------------------------------------------------------------------------ */
  /*                      Exemple: appel Supabase générateur                  */
  /* ------------------------------------------------------------------------ */

  const generateRule = useCallback(
    async (payload: {
      prompt: string;
      locale?: string;
      temperature?: number;
    }) => {
      // Validation minimale locale
      if (
        typeof payload.prompt !== "string" ||
        payload.prompt.trim().length < 8
      ) {
        safeToast({
          title: "Requête incomplète",
          description: "Votre prompt doit contenir au moins 8 caractères.",
          variant: "destructive",
        });
        return;
      }

      try {
        const cleanBody = JSON.parse(
          JSON.stringify({
            prompt: payload.prompt.trim(),
            board: undefined,
            options: {
              locale: payload.locale ?? "fr-CH",
              dryRun: false,
              temperature: payload.temperature,
            },
          }),
        );

        const { data, error } = await supabase.functions.invoke(
          "generate-chess-rule",
          {
            body: cleanBody,
            headers: { "Content-Type": "application/json" },
          },
        );

        if (error) {
          const raw = await readErrorResponseText(error);
          const msg = raw?.trim()?.length
            ? raw
            : getSupabaseFunctionErrorMessage(error) ||
              "Erreur lors de la génération.";
          safeToast({
            title: "Génération échouée",
            description: msg,
            variant: "destructive",
          });
          return;
        }

        const dataRecord = toRecord(data);
        const resultRecord = toRecord(dataRecord?.result);
        const ruleCandidate =
          resultRecord?.rule ?? dataRecord?.rule ?? dataRecord?.["rule_json"];

        if (!ruleCandidate) {
          safeToast({
            title: "Génération échouée",
            description:
              "La réponse du générateur ne contient aucune règle exploitable.",
            variant: "destructive",
          });
          return;
        }

        safeToast({
          title: "Règle générée",
          description: "Votre variante a été créée.",
        });

        try {
          const converted = convertRuleJsonToChessRule(
            ruleCandidate as RuleJSON,
          );
          setCustomRules((prev) => [converted, ...prev]);
        } catch {
          // Conversion non bloquante
        }
      } catch (e) {
        console.error("[generateRule] unexpected error", e);
        safeToast({
          title: "Génération échouée",
          description: "Erreur inattendue lors de l'appel au générateur.",
          variant: "destructive",
        });
      }
    },
    [safeToast],
  );

  /* ------------------------------------------------------------------------ */
  /*                              Rendu de la page                             */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">
          Partie • <span className="text-primary">{variantName}</span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled((v) => !v)}
          >
            {soundEnabled ? (
              <Volume2 className="mr-2 h-4 w-4" />
            ) : (
              <VolumeX className="mr-2 h-4 w-4" />
            )}
            Son
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCoachEnabled((v) => !v)}
          >
            <MessageSquareText className="mr-2 h-4 w-4" />
            Coach {coachEnabled ? "on" : "off"}
          </Button>
        </div>
      </div>

      {/* Zone supérieure : infos joueurs */}
      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 opacity-80" />
            <div>
              <div className="font-medium">{playerDisplayName}</div>
              <div className="text-sm opacity-70">{playerElo} Elo</div>
            </div>
            <Badge variant="outline" className="ml-auto">
              Blancs
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 opacity-80" />
            <div>
              <div className="font-medium">{opponentDisplayName}</div>
              <div className="text-sm opacity-70">{opponentElo} Elo</div>
            </div>
            <Badge variant="outline" className="ml-auto">
              Noirs
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 opacity-80" />
            <div>
              <div className="font-medium">Règles actives</div>
              <div className="text-sm opacity-70">
                {activeCustomRulesCount > 0
                  ? `${activeCustomRulesCount} règle${activeCustomRulesCount > 1 ? "s" : ""} perso`
                  : appliedPresetRuleIds.size > 0
                    ? `${appliedPresetRuleIds.size} préréglage(s)`
                    : "Standard"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Echiquier */}
      <section className="mb-6">
        <ChessBoard
          gameState={gameState}
          onSquareClick={(pos) => {
            // Exemple d’usage: déploiement “manuel” si une aptitude est en attente
            if (pendingAbility) {
              deploySpecialAttack(pendingAbility, pos);
              setPendingAbility(null);
              return;
            }
            // Sinon, logique standard de clic sur case (sélection/déplacement)
            setGameState((prev) => {
              const next = ChessEngine.handleSquareClick(prev, pos);
              return next;
            });
          }}
          onPieceClick={(piece) => {
            setGameState((prev) => ChessEngine.handlePieceClick(prev, piece));
          }}
        />
      </section>

      {/* Barre d’actions */}
      <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-white/10 p-4">
          <div className="mb-3 font-medium">Actions spéciales</div>
          <div className="grid grid-cols-2 gap-2">
            {specialAbilities.length === 0 && (
              <div className="col-span-2 text-sm opacity-70">
                Aucune aptitude disponible.
              </div>
            )}
            {specialAbilities.map((opt) => {
              const Icon = ABILITY_ICON_MAP[opt.icon] ?? Target;
              return (
                <Button
                  key={opt.id}
                  variant="secondary"
                  className="justify-start"
                  onClick={() => setPendingAbility(opt)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {opt.buttonLabel ?? opt.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4">
          <div className="mb-3 font-medium">Générateur de règle</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const prompt = String(fd.get("prompt") ?? "");
              void generateRule({ prompt, locale: "fr", temperature: 0.4 });
            }}
            className="flex gap-2"
          >
            <Input name="prompt" placeholder="Décrivez votre règle..." />
            <Button type="submit">
              <Send className="mr-2 h-4 w-4" />
              Générer
            </Button>
          </form>
        </div>

        <div className="rounded-lg border border-white/10 p-4">
          <div className="mb-3 font-medium">Partie</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setGameState((prev) => ChessEngine.resetGame(prev));
                initialBoardSnapshotRef.current = serializeBoardState(
                  ChessEngine.initializeBoard(),
                );
                safeToast({
                  title: "Nouvelle partie",
                  description: "La partie a été réinitialisée.",
                });
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
            {tournamentId && (
              <Button variant="outline" onClick={triggerAiFallback}>
                <Rocket className="mr-2 h-4 w-4" />
                Forcer IA
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Play;
