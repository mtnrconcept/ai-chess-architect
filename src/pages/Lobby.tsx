import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Globe,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChessRule } from "@/types/chess";
import RuleCard from "@/components/RuleCard";
import NeonBackground from "@/components/layout/NeonBackground";
import { analyzeRuleLogic, RuleAnalysisResult } from "@/lib/ruleValidation";
import { convertRuleJsonToChessRule } from "@/lib/ruleJsonToChessRule";
import { useAuth } from "@/contexts/AuthContext";
import {
  mapCustomRuleRowsToChessRules,
  mapCustomRuleRowToChessRule,
  type CustomRuleRow,
} from "@/lib/customRuleMapper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TIME_CONTROL_SETTINGS,
  type TimeControlOption,
} from "@/types/timeControl";
import { loadPresetRulesFromDatabase } from "@/lib/presetRulesAdapter";

type StatusFilterValue = "all" | "active" | "inactive";
type IssueFilterValue = "all" | "withIssues" | "withoutIssues";

type LobbyStatus = "waiting" | "matched" | "cancelled";

interface MultiplayerLobby {
  id: string;
  name: string;
  creator_id: string;
  active_rules: string[] | null;
  max_players: number | null;
  is_active: boolean;
  mode: "ai" | "player";
  status: LobbyStatus;
  opponent_id: string | null;
  opponent_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type CombinedRuleEntry = {
  origin: "custom" | "preset";
  rule: ChessRule;
  issues: string[];
};


const Lobby = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [customRules, setCustomRules] = useState<ChessRule[]>([]);
  const [databasePresetRules, setDatabasePresetRules] = useState<ChessRule[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [ruleIssues, setRuleIssues] = useState<Record<string, string[]>>({});
  const [selectedPresetRuleIds, setSelectedPresetRuleIds] = useState<
    Set<string>
  >(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<
    Set<ChessRule["category"]>
  >(new Set());
  const [selectedTriggers, setSelectedTriggers] = useState<
    Set<ChessRule["trigger"]>
  >(new Set());
  const [selectedPieces, setSelectedPieces] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [issueFilter, setIssueFilter] = useState<IssueFilterValue>("all");
  const [showAllTags, setShowAllTags] = useState(false);
  const [opponentType, setOpponentType] = useState<"ai" | "player">("ai");
  const [waitingLobbies, setWaitingLobbies] = useState<MultiplayerLobby[]>([]);
  const [lobbiesLoading, setLobbiesLoading] = useState(false);
  const [creatingLobby, setCreatingLobby] = useState(false);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [activeLobby, setActiveLobby] = useState<MultiplayerLobby | null>(null);
  const [playOptionsOpen, setPlayOptionsOpen] = useState(false);
  const [selectedQuickPlayEntry, setSelectedQuickPlayEntry] =
    useState<CombinedRuleEntry | null>(null);
  const [quickPlayOnlineLoading, setQuickPlayOnlineLoading] = useState(false);
  const [waitingDialogOpen, setWaitingDialogOpen] = useState(false);
  const [isQuickPlayOnline, setIsQuickPlayOnline] = useState(false);
  const [selectedTimeControl, setSelectedTimeControl] =
    useState<TimeControlOption>("blitz");

  const timeControlEntries = useMemo(
    () =>
      Object.entries(TIME_CONTROL_SETTINGS) as Array<
        [TimeControlOption, (typeof TIME_CONTROL_SETTINGS)[TimeControlOption]]
      >,
    [],
  );

  const ruleSelectionLocked = useMemo(
    () => activeLobby?.status === "waiting",
    [activeLobby],
  );

  const resolveUserDisplayName = useCallback(
    (targetUser?: User | null) => {
      const source = targetUser ?? user;
      if (!source) return "Joueur";

      const metadata = (source.user_metadata ?? {}) as Record<string, unknown>;
      const metadataName = ["full_name", "name", "username"]
        .map((key) => {
          const value = metadata[key];
          return typeof value === "string" && value.trim().length > 0
            ? value
            : undefined;
        })
        .find(Boolean);

      if (metadataName) return metadataName;
      if (typeof source.email === "string" && source.email.length > 0) {
        return source.email.split("@")[0] ?? source.email;
      }
      return "Joueur";
    },
    [user],
  );

  const fetchRules = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    try {
      const supabaseClient = supabase;

      const presetPromise = loadPresetRulesFromDatabase();
      let publishedPresetRules: ChessRule[] = [];

      if (supabaseClient) {
        const { data: publishedData, error: publishedError } =
          await supabaseClient
            .from("chess_rules")
            .select("id, rule_name, description, rule_json, category, status, created_at, rule_id, affected_pieces, tags, priority, assets, created_by, updated_at")
            .eq("source", "custom")
            .eq("status", "active")
            .order("created_at", { ascending: false });

        if (publishedError) {
          console.error(
            "[Lobby] Impossible de charger les règles publiées",
            publishedError,
          );
        } else {
          publishedPresetRules = (
            (publishedData as CustomRuleRow[] | null | undefined) ?? []
          )
            .map(mapCustomRuleRowToChessRule)
            .filter((rule): rule is ChessRule => rule !== null);
        }
      }

      const dbPresetRules = await presetPromise;
      const combinedPresetRules = [...dbPresetRules];
      const seenPresetRuleIds = new Set(
        combinedPresetRules.map((rule) => rule.ruleId),
      );

      for (const rule of publishedPresetRules) {
        if (!seenPresetRuleIds.has(rule.ruleId)) {
          combinedPresetRules.push(rule);
          seenPresetRuleIds.add(rule.ruleId);
        }
      }

      setDatabasePresetRules(combinedPresetRules);

      if (!user || !supabaseClient) {
        setCustomRules([]);
        setRuleIssues({});
        return;
      }

      const { data, error } = await supabaseClient
        .from("chess_rules")
        .select("*")
        .eq("created_by", user.id)
        .in("source", ["custom", "ai_generated"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as CustomRuleRow[];
      const mappedRules = mapCustomRuleRowsToChessRules(rows);

      const analyses: RuleAnalysisResult[] = mappedRules.map((rule) =>
        analyzeRuleLogic(rule),
      );

      const issues = Object.fromEntries(
        analyses.map((result) => [result.rule.ruleId, result.issues]),
      );

      setRuleIssues(issues);
      setCustomRules(analyses.map((result) => result.rule));
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de charger les règles";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [authLoading, toast, user]);

  const fetchWaitingLobbies = useCallback(async () => {
    setLobbiesLoading(true);
    try {
      const { data, error } = await supabase
        .from("lobbies")
        .select(
          "id, name, creator_id, active_rules, max_players, is_active, mode, status, opponent_id, opponent_name, created_at, updated_at",
        )
        .eq("mode", "player")
        .eq("status", "waiting")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as MultiplayerLobby[];
      setWaitingLobbies(rows.filter((lobby) => lobby.creator_id !== user?.id));
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de charger les parties en attente";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    } finally {
      setLobbiesLoading(false);
    }
  }, [toast, user?.id]);

  const fetchActiveLobby = useCallback(async () => {
    if (!user) {
      setActiveLobby(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("lobbies")
        .select(
          "id, name, creator_id, active_rules, max_players, is_active, mode, status, opponent_id, opponent_name, created_at, updated_at",
        )
        .eq("creator_id", user.id)
        .in("status", ["waiting", "matched"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const row = (data ?? [])[0] as MultiplayerLobby | undefined;
      setActiveLobby(row ?? null);
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de récupérer votre partie en attente";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    }
  }, [toast, user]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    fetchWaitingLobbies();
  }, [fetchWaitingLobbies]);

  useEffect(() => {
    fetchActiveLobby();
  }, [fetchActiveLobby]);

  useEffect(() => {
    if (!isQuickPlayOnline) return;
    if (!activeLobby || activeLobby.status !== "waiting") {
      setWaitingDialogOpen(false);
      setIsQuickPlayOnline(false);
      setQuickPlayOnlineLoading(false);
      setSelectedQuickPlayEntry(null);
    }
  }, [activeLobby, isQuickPlayOnline]);

  useEffect(() => {
    const channel = supabase
      .channel("lobbies-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobbies" },
        () => {
          fetchWaitingLobbies();
          if (user) {
            fetchActiveLobby();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActiveLobby, fetchWaitingLobbies, user]);

  const deleteRule = async (ruleId: string) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour gérer vos règles personnalisées.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("chess_rules")
        .delete()
        .eq("rule_id", ruleId)
        .eq("created_by", user.id);

      if (error) throw error;

      toast({ title: "Règle supprimée" });
      fetchRules();
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de supprimer la règle";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    }
  };

  const toggleRuleStatus = async (ruleId: string, isActive: boolean) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour gérer vos règles personnalisées.",
        variant: "destructive",
      });
      return;
    }

    if (ruleSelectionLocked) {
      toast({
        title: "Règle verrouillée",
        description:
          "Annulez votre partie en attente pour modifier la règle sélectionnée.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isActive) {
        const { error: deactivateError } = await supabase
          .from("chess_rules")
          .update({ status: "archived" })
          .eq("created_by", user.id)
          .neq("rule_id", ruleId);

        if (deactivateError) throw deactivateError;
      }

      const { error } = await supabase
        .from("chess_rules")
        .update({ status: isActive ? "active" : "archived" })
        .eq("rule_id", ruleId)
        .eq("created_by", user.id);

      if (error) throw error;

      if (isActive) {
        setSelectedPresetRuleIds(new Set());
      }

      setCustomRules((prev) =>
        prev.map((rule) => {
          if (rule.ruleId === ruleId) {
            return { ...rule, isActive };
          }
          return isActive ? { ...rule, isActive: false } : rule;
        }),
      );

      toast({
        title: isActive ? "Règle activée" : "Règle désactivée",
      });
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour la règle";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    }
  };

  const deactivateAllCustomRules = useCallback(async () => {
    if (customRules.length === 0) return;

    if (!user) {
      setCustomRules((prev) =>
        prev.map((rule) => ({ ...rule, isActive: false })),
      );
      return;
    }

    const activeIds = customRules
      .filter((rule) => rule.isActive)
      .map((rule) => rule.ruleId);

    if (activeIds.length === 0) {
      setCustomRules((prev) =>
        prev.map((rule) => ({ ...rule, isActive: false })),
      );
      return;
    }

    const { error } = await supabase
      .from("chess_rules")
      .update({ status: "archived" })
      .eq("created_by", user.id)
      .in("rule_id", activeIds);

    if (error) throw error;

    setCustomRules((prev) =>
      prev.map((rule) => ({ ...rule, isActive: false })),
    );
  }, [customRules, user]);

  const presetAnalyses = useMemo(() => {
    return databasePresetRules.map((rule) => analyzeRuleLogic(rule));
  }, [databasePresetRules]);

  const presetRuleMap = useMemo(() => {
    return new Map(databasePresetRules.map((rule) => [rule.ruleId, rule]));
  }, [databasePresetRules]);

  const priorityBounds = useMemo(() => {
    const allRules = [
      ...customRules,
      ...presetAnalyses.map(({ rule }) => rule),
    ];

    if (allRules.length === 0) {
      return { min: 0, max: 10 } as const;
    }

    const priorities = allRules.map(
      (rule) =>
        (typeof rule.priority === "number"
          ? rule.priority
          : Number(rule.priority ?? 0)) || 0,
    );

    const min = Math.min(...priorities);
    const max = Math.max(...priorities);

    return { min, max: Math.max(min, max) } as const;
  }, [customRules, presetAnalyses]);

  const [priorityRange, setPriorityRange] = useState<[number, number]>([
    priorityBounds.min,
    priorityBounds.max,
  ]);

  useEffect(() => {
    setPriorityRange((prev) => {
      if (prev[0] === priorityBounds.min && prev[1] === priorityBounds.max) {
        return prev;
      }
      return [priorityBounds.min, priorityBounds.max];
    });
  }, [priorityBounds.min, priorityBounds.max]);

  const TAG_DISPLAY_LIMIT = 8;

  const selectedPresetRuleId = useMemo(() => {
    const iterator = selectedPresetRuleIds.values();
    const first = iterator.next();
    return first.done ? null : first.value;
  }, [selectedPresetRuleIds]);

  const hasSelectedPresetRules = useMemo(
    () => selectedPresetRuleIds.size > 0,
    [selectedPresetRuleIds],
  );

  const activeCustomRule = useMemo(
    () => customRules.find((rule) => rule.isActive) ?? null,
    [customRules],
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    customRules.forEach((rule) => {
      rule.tags?.forEach((tag) => tags.add(tag.toLowerCase()));
    });
    presetAnalyses.forEach(({ rule }) => {
      rule.tags?.forEach((tag) => tags.add(tag.toLowerCase()));
    });
    return Array.from(tags).sort();
  }, [customRules, presetAnalyses]);

  const hasMoreTags = availableTags.length > TAG_DISPLAY_LIMIT;

  const displayedTags = useMemo(
    () =>
      showAllTags || !hasMoreTags
        ? availableTags
        : availableTags.slice(0, TAG_DISPLAY_LIMIT),
    [availableTags, hasMoreTags, showAllTags],
  );

  useEffect(() => {
    if (!hasMoreTags) {
      setShowAllTags(false);
    }
  }, [hasMoreTags]);

  const availableCategories = useMemo(() => {
    const categories = new Set<ChessRule["category"]>();
    customRules.forEach((rule) => categories.add(rule.category));
    presetAnalyses.forEach(({ rule }) => categories.add(rule.category));
    return Array.from(categories).sort();
  }, [customRules, presetAnalyses]);

  const availableTriggers = useMemo(() => {
    const triggers = new Set<ChessRule["trigger"]>();
    customRules.forEach((rule) => triggers.add(rule.trigger));
    presetAnalyses.forEach(({ rule }) => triggers.add(rule.trigger));
    return Array.from(triggers).sort();
  }, [customRules, presetAnalyses]);

  const availablePieces = useMemo(() => {
    const pieces = new Set<string>();
    const addPieces = (rule: ChessRule) => {
      rule.affectedPieces?.forEach((piece) => {
        if (typeof piece === "string") {
          pieces.add(piece.toLowerCase());
        }
      });
    };

    customRules.forEach(addPieces);
    presetAnalyses.forEach(({ rule }) => addPieces(rule));

    const order = ["all", "king", "queen", "rook", "bishop", "knight", "pawn"];

    return Array.from(pieces).sort((a, b) => {
      const indexA = order.indexOf(a);
      const indexB = order.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [customRules, presetAnalyses]);

  const categoryLabels: Record<ChessRule["category"], string> = {
    movement: "Mouvement",
    capture: "Attaque",
    special: "Spécial",
    condition: "Condition",
    victory: "Victoire",
    restriction: "Restriction",
    defense: "Défense",
    behavior: "Comportement",
    vip: "VIP · Magnus Goat",
  };

  const triggerLabels: Record<ChessRule["trigger"], string> = {
    always: "Toujours",
    onMove: "Lors d'un mouvement",
    onCapture: "Lors d'une capture",
    onCheck: "Lors d'un échec",
    onCheckmate: "Lors d'un mat",
    turnBased: "Selon le tour",
    conditional: "Conditionnel",
  };

  const pieceLabels: Record<string, string> = {
    all: "Toutes les pièces",
    king: "Roi",
    queen: "Reine",
    rook: "Tour",
    bishop: "Fou",
    knight: "Cavalier",
    pawn: "Pion",
  };

  const filteredCustomRules = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return customRules.filter((rule) => {
      const ruleTags = new Set(
        rule.tags?.map((tag) => tag.toLowerCase()) ?? [],
      );
      const matchesTags =
        selectedTags.size === 0 ||
        Array.from(selectedTags).every((tag) => ruleTags.has(tag));
      if (!matchesTags) return false;

      const matchesCategories =
        selectedCategories.size === 0 || selectedCategories.has(rule.category);
      if (!matchesCategories) return false;

      const matchesTriggers =
        selectedTriggers.size === 0 || selectedTriggers.has(rule.trigger);
      if (!matchesTriggers) return false;

      const normalizedPieces = new Set(
        (rule.affectedPieces ?? []).map((piece) => piece.toLowerCase()),
      );
      const matchesPieces =
        selectedPieces.size === 0 ||
        Array.from(selectedPieces).every(
          (piece) => normalizedPieces.has(piece) || normalizedPieces.has("all"),
        );
      if (!matchesPieces) return false;

      const matchesPriority =
        rule.priority >= priorityRange[0] && rule.priority <= priorityRange[1];
      if (!matchesPriority) return false;

      const issueCount = ruleIssues[rule.ruleId]?.length ?? 0;
      if (issueFilter === "withIssues" && issueCount === 0) return false;
      if (issueFilter === "withoutIssues" && issueCount > 0) return false;

      if (statusFilter === "active" && !rule.isActive) return false;
      if (statusFilter === "inactive" && rule.isActive) return false;

      if (normalizedQuery.length > 0) {
        const haystack = [
          rule.ruleName,
          rule.description,
          rule.trigger,
          rule.category,
          ...(rule.affectedPieces ?? []),
          ...(rule.tags ?? []),
        ]
          .filter(Boolean)
          .map((value) => value.toString().toLowerCase());

        const matchesQuery = haystack.some((value) =>
          value.includes(normalizedQuery),
        );
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [
    customRules,
    issueFilter,
    priorityRange,
    ruleIssues,
    searchQuery,
    selectedCategories,
    selectedPieces,
    selectedTags,
    selectedTriggers,
    statusFilter,
  ]);

  const filteredPresetAnalyses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return presetAnalyses.filter(({ rule, issues }) => {
      if (statusFilter !== "all") {
        return false;
      }

      const ruleTags = new Set(
        rule.tags?.map((tag) => tag.toLowerCase()) ?? [],
      );
      const matchesTags =
        selectedTags.size === 0 ||
        Array.from(selectedTags).every((tag) => ruleTags.has(tag));
      if (!matchesTags) return false;

      const matchesCategories =
        selectedCategories.size === 0 || selectedCategories.has(rule.category);
      if (!matchesCategories) return false;

      const matchesTriggers =
        selectedTriggers.size === 0 || selectedTriggers.has(rule.trigger);
      if (!matchesTriggers) return false;

      const normalizedPieces = new Set(
        (rule.affectedPieces ?? []).map((piece) => piece.toLowerCase()),
      );
      const matchesPieces =
        selectedPieces.size === 0 ||
        Array.from(selectedPieces).every(
          (piece) => normalizedPieces.has(piece) || normalizedPieces.has("all"),
        );
      if (!matchesPieces) return false;

      const matchesPriority =
        rule.priority >= priorityRange[0] && rule.priority <= priorityRange[1];
      if (!matchesPriority) return false;

      if (issueFilter === "withIssues" && issues.length === 0) return false;
      if (issueFilter === "withoutIssues" && issues.length > 0) return false;

      if (normalizedQuery.length > 0) {
        const haystack = [
          rule.ruleName,
          rule.description,
          rule.trigger,
          rule.category,
          ...(rule.affectedPieces ?? []),
          ...(rule.tags ?? []),
        ]
          .filter(Boolean)
          .map((value) => value.toString().toLowerCase());

        const matchesQuery = haystack.some((value) =>
          value.includes(normalizedQuery),
        );
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [
    issueFilter,
    presetAnalyses,
    priorityRange,
    searchQuery,
    selectedCategories,
    selectedPieces,
    selectedTags,
    selectedTriggers,
    statusFilter,
  ]);

  const combinedRuleEntries = useMemo<CombinedRuleEntry[]>(() => {
    const customEntries = filteredCustomRules.map((rule) => ({
      origin: "custom" as const,
      rule,
      issues: ruleIssues[rule.ruleId] ?? [],
    }));

    const presetEntries = filteredPresetAnalyses.map(({ rule, issues }) => ({
      origin: "preset" as const,
      rule,
      issues,
    }));

    return [...customEntries, ...presetEntries];
  }, [filteredCustomRules, filteredPresetAnalyses, ruleIssues]);

  const totalFilteredRulesCount = combinedRuleEntries.length;
  const totalAvailableRulesCount =
    customRules.length + databasePresetRules.length;

  const toggleTagFilter = (tag: string) => {
    setSelectedTags((prev) => {
      const normalized = tag.toLowerCase();
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  };

  const clearTagFilters = () => setSelectedTags(new Set());

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategories(new Set());
    setSelectedTriggers(new Set());
    setSelectedPieces(new Set());
    setStatusFilter("all");
    setIssueFilter("all");
    clearTagFilters();
    setPriorityRange([priorityBounds.min, priorityBounds.max]);
  };

  const hasFilters = useMemo(() => {
    const normalizedQuery = searchQuery.trim();
    return (
      normalizedQuery.length > 0 ||
      selectedCategories.size > 0 ||
      selectedTriggers.size > 0 ||
      selectedPieces.size > 0 ||
      selectedTags.size > 0 ||
      statusFilter !== "all" ||
      issueFilter !== "all" ||
      priorityRange[0] !== priorityBounds.min ||
      priorityRange[1] !== priorityBounds.max
    );
  }, [
    issueFilter,
    priorityBounds.max,
    priorityBounds.min,
    priorityRange,
    searchQuery,
    selectedCategories,
    selectedPieces,
    selectedTags,
    selectedTriggers,
    statusFilter,
  ]);

  const handleCategoryToggle = (
    category: ChessRule["category"],
    shouldSelect: boolean,
  ) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (shouldSelect) {
        next.add(category);
      } else {
        next.delete(category);
      }
      return next;
    });
  };

  const handleTriggerToggle = (
    trigger: ChessRule["trigger"],
    shouldSelect: boolean,
  ) => {
    setSelectedTriggers((prev) => {
      const next = new Set(prev);
      if (shouldSelect) {
        next.add(trigger);
      } else {
        next.delete(trigger);
      }
      return next;
    });
  };

  const handlePieceToggle = (piece: string, shouldSelect: boolean) => {
    const normalized = piece.toLowerCase();
    setSelectedPieces((prev) => {
      const next = new Set(prev);
      if (shouldSelect) {
        next.add(normalized);
      } else {
        next.delete(normalized);
      }
      return next;
    });
  };

  const handlePresetSelection = (ruleId: string, selected: boolean) => {
    if (ruleSelectionLocked) {
      toast({
        title: "Règle verrouillée",
        description:
          "Annulez votre partie en attente pour modifier la règle sélectionnée.",
        variant: "destructive",
      });
      return;
    }

    if (selected) {
      deactivateAllCustomRules()
        .then(() => {
          setSelectedPresetRuleIds(new Set([ruleId]));
        })
        .catch((error: unknown) => {
          const description =
            error instanceof Error
              ? error.message
              : "Impossible de mettre à jour les règles personnalisées";
          toast({
            title: "Erreur",
            description,
            variant: "destructive",
          });
        });
    } else {
      setSelectedPresetRuleIds(new Set());
    }
  };

  const totalSelectedRules = useMemo(
    () => (activeCustomRule ? 1 : 0) + (selectedPresetRuleId ? 1 : 0),
    [activeCustomRule, selectedPresetRuleId],
  );

  const selectedRuleInfo = useMemo(() => {
    if (activeCustomRule) {
      return { type: "custom" as const, rule: activeCustomRule };
    }

    if (selectedPresetRuleId) {
      const presetRule = presetRuleMap.get(selectedPresetRuleId);
      if (presetRule) {
        return { type: "preset" as const, rule: presetRule };
      }
    }

    return null;
  }, [activeCustomRule, presetRuleMap, selectedPresetRuleId]);

  const canStartGame = totalSelectedRules === 1;

  const loadRuleForLobby = useCallback(
    async (ruleId: string): Promise<ChessRule | null> => {
      const presetRule = presetRuleMap.get(ruleId);
      if (presetRule) return presetRule;

      const ownedRule = customRules.find((rule) => rule.ruleId === ruleId);
      if (ownedRule) return ownedRule;

      const { data, error } = await supabase
        .from("chess_rules")
        .select("*")
        .eq("rule_id", ruleId)
        .limit(1);

      if (error) throw error;

      const row = (data ?? [])[0] as CustomRuleRow | undefined;
      if (!row) return null;

      return mapCustomRuleRowsToChessRules([row])[0];
    },
    [customRules, presetRuleMap],
  );

  const activeLobbyRule = useMemo(() => {
    if (
      !activeLobby ||
      !Array.isArray(activeLobby.active_rules) ||
      activeLobby.active_rules.length === 0
    ) {
      return null;
    }
    const ruleId = activeLobby.active_rules[0];
    return (
      presetRuleMap.get(ruleId) ??
      customRules.find((rule) => rule.ruleId === ruleId) ??
      null
    );
  }, [activeLobby, customRules, presetRuleMap]);

  const getRuleLabel = useCallback(
    (ruleId: string) => {
      const preset = presetRuleMap.get(ruleId);
      if (preset) return preset.ruleName;
      const owned = customRules.find((rule) => rule.ruleId === ruleId);
      if (owned) return owned.ruleName;
      return "Règle personnalisée";
    },
    [customRules, presetRuleMap],
  );

  const handleOpenQuickPlay = useCallback((entry: CombinedRuleEntry) => {
    setSelectedQuickPlayEntry(entry);
    setPlayOptionsOpen(true);
  }, []);

  const startQuickPlayGame = useCallback(
    (
      entry: CombinedRuleEntry,
      mode: "ai" | "local",
      timeControl: TimeControlOption,
    ) => {
      const playerName = resolveUserDisplayName(user);

      if (entry.origin === "custom") {
        const preparedRule = { ...entry.rule, isActive: true };
        navigate("/play", {
          state: {
            customRules: [preparedRule],
            presetRuleIds: [],
            opponentType: mode,
            playerName,
            timeControl,
          },
        });
      } else {
        navigate("/play", {
          state: {
            customRules: [],
            presetRuleIds: [entry.rule.ruleId],
            opponentType: mode,
            playerName,
            timeControl,
          },
        });
      }
    },
    [navigate, resolveUserDisplayName, user],
  );

  const createQuickOnlineLobby = useCallback(
    async (entry: CombinedRuleEntry) => {
      if (!user) {
        toast({
          title: "Connexion requise",
          description: "Connectez-vous pour créer une partie en ligne.",
          variant: "destructive",
        });
        return;
      }

      if (ruleSelectionLocked && activeLobby) {
        toast({
          title: "Partie déjà en attente",
          description:
            "Annulez votre partie actuelle avant d'en créer une nouvelle.",
          variant: "destructive",
        });
        return;
      }

      const ruleId = entry.rule.ruleId;
      const displayName = resolveUserDisplayName(user);
      const defaultName = `Défi ${entry.rule.ruleName}`.slice(0, 80);

      setIsQuickPlayOnline(true);
      setQuickPlayOnlineLoading(true);
      setWaitingDialogOpen(true);

      try {
        const { data, error } = await supabase
          .from("lobbies")
          .insert({
            name:
              defaultName.length > 0 ? defaultName : `Partie de ${displayName}`,
            creator_id: user.id,
            active_rules: [ruleId],
            max_players: 2,
            is_active: true,
            mode: "player",
            status: "waiting",
            opponent_id: null,
            opponent_name: null,
          })
          .select()
          .single();

        if (error) throw error;

        setActiveLobby(data as MultiplayerLobby);
        toast({
          title: "Recherche d'adversaire lancée",
          description: "Nous prévenons la communauté de votre défi.",
        });
        fetchWaitingLobbies();
      } catch (error: unknown) {
        const description =
          error instanceof Error
            ? error.message
            : "Impossible de créer la partie en ligne";
        toast({
          title: "Erreur",
          description,
          variant: "destructive",
        });
        setWaitingDialogOpen(false);
        setIsQuickPlayOnline(false);
      } finally {
        setQuickPlayOnlineLoading(false);
      }
    },
    [
      activeLobby,
      fetchWaitingLobbies,
      resolveUserDisplayName,
      ruleSelectionLocked,
      toast,
      user,
    ],
  );

  const handleQuickPlayModeSelect = useCallback(
    (mode: "ai" | "local" | "online") => {
      if (!selectedQuickPlayEntry) return;

      if (mode === "ai" || mode === "local") {
        startQuickPlayGame(selectedQuickPlayEntry, mode, selectedTimeControl);
        setPlayOptionsOpen(false);
        setSelectedQuickPlayEntry(null);
        setIsQuickPlayOnline(false);
        return;
      }

      setPlayOptionsOpen(false);
      void createQuickOnlineLobby(selectedQuickPlayEntry);
    },
    [
      createQuickOnlineLobby,
      selectedQuickPlayEntry,
      selectedTimeControl,
      startQuickPlayGame,
    ],
  );

  const startAiGame = () => {
    if (!selectedRuleInfo || !canStartGame) {
      toast({
        title: "Aucune règle sélectionnée",
        description:
          "Choisissez exactement une règle avant de lancer une partie.",
        variant: "destructive",
      });
      return;
    }

    if (selectedRuleInfo.type === "custom") {
      const preparedRule = { ...selectedRuleInfo.rule, isActive: true };
      navigate("/play", {
        state: {
          customRules: [preparedRule],
          presetRuleIds: [],
          opponentType: "ai",
          playerName: resolveUserDisplayName(user),
        },
      });
    } else {
      navigate("/play", {
        state: {
          customRules: [],
          presetRuleIds: [selectedRuleInfo.rule.ruleId],
          opponentType: "ai",
          playerName: resolveUserDisplayName(user),
        },
      });
    }
  };

  const handleCreateLobby = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour créer une partie multijoueur.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedRuleInfo || !canStartGame) {
      toast({
        title: "Aucune règle sélectionnée",
        description:
          "Choisissez exactement une règle avant de créer une partie.",
        variant: "destructive",
      });
      return;
    }

    if (ruleSelectionLocked && activeLobby) {
      toast({
        title: "Partie déjà en attente",
        description:
          "Annulez votre partie actuelle avant d'en créer une nouvelle.",
        variant: "destructive",
      });
      return;
    }

    const ruleId = selectedRuleInfo.rule.ruleId;
    const displayName = resolveUserDisplayName(user);
    const trimmedName = lobbyName.trim();

    setCreatingLobby(true);
    try {
      const { data, error } = await supabase
        .from("lobbies")
        .insert({
          name:
            trimmedName.length > 0 ? trimmedName : `Partie de ${displayName}`,
          creator_id: user.id,
          active_rules: [ruleId],
          max_players: 2,
          is_active: true,
          mode: "player",
          status: "waiting",
          opponent_id: null,
          opponent_name: null,
        })
        .select()
        .single();

      if (error) throw error;

      setLobbyName("");
      setActiveLobby(data as MultiplayerLobby);
      toast({
        title: "Partie créée",
        description: "Votre partie est en attente d'un adversaire.",
      });
      fetchWaitingLobbies();
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de créer la partie";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    } finally {
      setCreatingLobby(false);
    }
  };

  const handleCancelLobby = async () => {
    if (!user || !activeLobby) return;

    try {
      const { error } = await supabase
        .from("lobbies")
        .update({ status: "cancelled", is_active: false })
        .eq("id", activeLobby.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      setActiveLobby(null);
      toast({ title: "Partie annulée" });
      fetchWaitingLobbies();
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible d'annuler la partie";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    }
  };

  const handleJoinLobby = async (lobby: MultiplayerLobby) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour rejoindre une partie.",
        variant: "destructive",
      });
      return;
    }

    if (!Array.isArray(lobby.active_rules) || lobby.active_rules.length === 0) {
      toast({
        title: "Partie invalide",
        description: "Cette partie n'a pas de règle associée.",
        variant: "destructive",
      });
      return;
    }

    const ruleId = lobby.active_rules[0];
    setJoiningLobbyId(lobby.id);
    try {
      const rule = await loadRuleForLobby(ruleId);
      if (!rule) {
        toast({
          title: "Règle introuvable",
          description: "La règle associée à cette partie est inaccessible.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase
        .from("lobbies")
        .update({
          status: "matched",
          is_active: false,
          opponent_id: user.id,
          opponent_name: resolveUserDisplayName(user),
        })
        .eq("id", lobby.id)
        .eq("status", "waiting")
        .select()
        .single();

      if (error) throw error;

      const preparedRule = { ...rule, isActive: true };
      const isPreset = presetRuleMap.has(rule.ruleId);

      navigate("/play", {
        state: {
          customRules: isPreset ? [] : [preparedRule],
          presetRuleIds: isPreset ? [rule.ruleId] : [],
          opponentType: "player",
          lobbyId: lobby.id,
          role: "opponent",
          lobbyName: lobby.name,
          opponentName: lobby.name,
          playerName: resolveUserDisplayName(user),
        },
      });

      fetchWaitingLobbies();
      if (data) {
        fetchActiveLobby();
      }
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de rejoindre la partie";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    } finally {
      setJoiningLobbyId(null);
    }
  };

  const handleLaunchMatchedGame = async () => {
    if (!user || !activeLobby || activeLobby.status !== "matched") {
      return;
    }

    if (
      !Array.isArray(activeLobby.active_rules) ||
      activeLobby.active_rules.length === 0
    ) {
      toast({
        title: "Aucune règle trouvée",
        description: "Impossible de lancer la partie sans règle associée.",
        variant: "destructive",
      });
      return;
    }

    const ruleId = activeLobby.active_rules[0];
    try {
      const rule = await loadRuleForLobby(ruleId);
      if (!rule) {
        toast({
          title: "Règle introuvable",
          description: "La règle associée à cette partie est inaccessible.",
          variant: "destructive",
        });
        return;
      }

      const preparedRule = { ...rule, isActive: true };
      const isPreset = presetRuleMap.has(rule.ruleId);

      navigate("/play", {
        state: {
          customRules: isPreset ? [] : [preparedRule],
          presetRuleIds: isPreset ? [rule.ruleId] : [],
          opponentType: "player",
          lobbyId: activeLobby.id,
          role: "creator",
          lobbyName: activeLobby.name,
          opponentName: activeLobby.opponent_name ?? "Adversaire",
          playerName: resolveUserDisplayName(user),
        },
      });
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible de lancer la partie";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    }
  };

  return (
    <NeonBackground contentClassName="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Lobby des Règles
          </h1>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Adversaire
                </Label>
                <Select
                  value={opponentType}
                  onValueChange={(value) =>
                    setOpponentType(value as "ai" | "player")
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Choisir l'adversaire" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai">
                      Intelligence artificielle
                    </SelectItem>
                    <SelectItem value="player">Autre joueur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {opponentType === "player" && (
                <Input
                  value={lobbyName}
                  onChange={(event) => setLobbyName(event.target.value)}
                  placeholder="Nom de votre partie"
                  className="w-full sm:w-64"
                  disabled={ruleSelectionLocked}
                />
              )}
            </div>
            <Button
              variant="outline"
              onClick={opponentType === "ai" ? startAiGame : handleCreateLobby}
              disabled={
                !canStartGame ||
                (opponentType === "player" &&
                  (ruleSelectionLocked || creatingLobby))
              }
            >
              {opponentType === "player" && creatingLobby && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {opponentType === "ai" && "Jouer contre l'IA"}
              {opponentType === "player" &&
                (ruleSelectionLocked
                  ? "Partie en attente"
                  : "Créer une partie multijoueur")}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="w-full md:max-w-md">
              <Label
                htmlFor="rule-search"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Recherche intelligente
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="rule-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Rechercher une règle par nom, description ou pièce"
                  className="pl-9"
                />
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={resetFilters}
              disabled={!hasFilters}
            >
              Réinitialiser les filtres
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>Catégories</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selectedCategories.size > 0
                      ? `${selectedCategories.size} sélectionnée(s)`
                      : "Toutes"}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Catégories de règles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableCategories.map((category) => (
                  <DropdownMenuCheckboxItem
                    key={category}
                    checked={selectedCategories.has(category)}
                    onCheckedChange={(checked) =>
                      handleCategoryToggle(category, checked === true)
                    }
                  >
                    {categoryLabels[category] ?? category}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>Déclencheurs</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selectedTriggers.size > 0
                      ? `${selectedTriggers.size} sélectionné(s)`
                      : "Tous"}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Déclencheurs disponibles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTriggers.map((trigger) => (
                  <DropdownMenuCheckboxItem
                    key={trigger}
                    checked={selectedTriggers.has(trigger)}
                    onCheckedChange={(checked) =>
                      handleTriggerToggle(trigger, checked === true)
                    }
                  >
                    {triggerLabels[trigger] ?? trigger}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>Pièces affectées</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selectedPieces.size > 0
                      ? `${selectedPieces.size} sélectionnée(s)`
                      : "Toutes"}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Pièces ciblées</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availablePieces.map((piece) => (
                  <DropdownMenuCheckboxItem
                    key={piece}
                    checked={selectedPieces.has(piece)}
                    onCheckedChange={(checked) =>
                      handlePieceToggle(piece, checked === true)
                    }
                  >
                    {pieceLabels[piece] ?? piece}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as StatusFilterValue)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Statut (perso)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actives uniquement</SelectItem>
                <SelectItem value="inactive">Inactives uniquement</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={issueFilter}
              onValueChange={(value) =>
                setIssueFilter(value as IssueFilterValue)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualité des règles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les règles</SelectItem>
                <SelectItem value="withIssues">
                  Avec anomalies détectées
                </SelectItem>
                <SelectItem value="withoutIssues">Sans anomalies</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Priorité des règles
            </Label>
            <Slider
              value={priorityRange}
              onValueChange={(value) => setPriorityRange([value[0], value[1]])}
              min={priorityBounds.min}
              max={priorityBounds.max}
              step={1}
              disabled={priorityBounds.min === priorityBounds.max}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Min : {priorityRange[0]}</span>
              <span>Max : {priorityRange[1]}</span>
            </div>
          </div>

          {availableTags.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  Filtrer par tags :
                </span>
                {displayedTags.map((tag) => {
                  const normalized = tag.toLowerCase();
                  const isActive = selectedTags.has(normalized);
                  return (
                    <Button
                      key={normalized}
                      size="sm"
                      variant={isActive ? "premium" : "outline"}
                      className="rounded-full px-3 py-1 text-xs uppercase tracking-wide"
                      onClick={() => toggleTagFilter(tag)}
                    >
                      #{tag}
                    </Button>
                  );
                })}
                {hasMoreTags && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full px-3 py-1 text-xs uppercase tracking-wide"
                    onClick={() => setShowAllTags((prev) => !prev)}
                  >
                    {showAllTags ? "Afficher moins" : "Afficher plus"}
                  </Button>
                )}
                {selectedTags.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearTagFilters}>
                    Réinitialiser les tags
                  </Button>
                )}
              </div>
              {selectedTags.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedTags.size} tag(s) actif(s) ·{" "}
                  {totalFilteredRulesCount} règle(s) correspondante(s)
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Ma partie multijoueur</h2>
              {activeLobby && (
                <Badge
                  variant={
                    activeLobby.status === "matched" ? "secondary" : "outline"
                  }
                >
                  {activeLobby.status === "waiting" && "En attente"}
                  {activeLobby.status === "matched" && "Adversaire trouvé"}
                  {activeLobby.status === "cancelled" && "Annulée"}
                </Badge>
              )}
            </div>

            {!user && (
              <p className="text-sm text-muted-foreground">
                Connectez-vous pour créer une partie et inviter un autre joueur.
              </p>
            )}

            {user && !activeLobby && (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Sélectionnez une règle unique puis créez votre partie
                  multijoueur.
                </p>
                <p>
                  Votre partie apparaîtra automatiquement dans la liste des
                  joueurs en attente.
                </p>
              </div>
            )}

            {user && activeLobby && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Nom de la partie
                  </p>
                  <p className="font-semibold">{activeLobby.name}</p>
                </div>
                {activeLobbyRule && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Règle sélectionnée
                    </p>
                    <p className="font-semibold">{activeLobbyRule.ruleName}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        Priorité {activeLobbyRule.priority}
                      </Badge>
                      <Badge variant="outline">
                        {categoryLabels[activeLobbyRule.category]}
                      </Badge>
                    </div>
                  </div>
                )}
                {activeLobby.status === "waiting" && (
                  <p className="text-sm text-muted-foreground">
                    Partagez ce lobby ou attendez qu'un joueur vous rejoigne.
                  </p>
                )}
                {activeLobby.status === "matched" && (
                  <p className="text-sm text-muted-foreground">
                    Adversaire :{" "}
                    {activeLobby.opponent_name ?? "Adversaire inconnu"}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={handleCancelLobby} size="sm">
                    Annuler la partie
                  </Button>
                  {activeLobby.status === "matched" && (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={handleLaunchMatchedGame}
                    >
                      Lancer la partie
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Joueurs en attente</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchWaitingLobbies}
                disabled={lobbiesLoading}
              >
                {lobbiesLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Actualiser
              </Button>
            </div>

            {lobbiesLoading && (
              <p className="text-sm text-muted-foreground">
                Chargement des parties en attente...
              </p>
            )}

            {!lobbiesLoading && waitingLobbies.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun joueur n'attend actuellement. Créez une partie pour être
                le premier !
              </p>
            )}

            {!lobbiesLoading && waitingLobbies.length > 0 && (
              <div className="space-y-3">
                {waitingLobbies.map((lobby) => {
                  const ruleId = Array.isArray(lobby.active_rules)
                    ? lobby.active_rules[0]
                    : undefined;
                  return (
                    <div
                      key={lobby.id}
                      className="rounded-lg border border-border/60 bg-card/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{lobby.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Règle : {ruleId ? getRuleLabel(ruleId) : "Inconnue"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="gold"
                          onClick={() => handleJoinLobby(lobby)}
                          disabled={joiningLobbyId === lobby.id}
                        >
                          {joiningLobbyId === lobby.id && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Rejoindre
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="w-full space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Lobby « Règles insolites »
            </h2>
            <Badge variant="secondary">
              {totalFilteredRulesCount}/{totalAvailableRulesCount} règle(s)
            </Badge>
          </div>

          {loading && (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/40 py-6 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Chargement de vos règles personnalisées…
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {combinedRuleEntries.map((entry, index) => (
              <RuleCard
                key={`${entry.origin}-${entry.rule.id || entry.rule.ruleId}-${index}`}
                rule={entry.rule}
                onDelete={entry.origin === "custom" ? deleteRule : undefined}
                onToggle={
                  entry.origin === "custom" ? toggleRuleStatus : undefined
                }
                showActions={entry.origin === "custom"}
                issues={entry.issues}
                selectable={entry.origin === "preset"}
                isSelected={
                  entry.origin === "preset"
                    ? selectedPresetRuleIds.has(entry.rule.ruleId)
                    : false
                }
                onSelectChange={(selected) => {
                  if (entry.origin === "preset") {
                    handlePresetSelection(entry.rule.ruleId, selected);
                  }
                }}
                showPlayButton
                onPlay={() => handleOpenQuickPlay(entry)}
              />
            ))}
          </div>

          {totalFilteredRulesCount === 0 && (
            <div className="rounded-lg border border-border/60 bg-card/40 py-12 text-center text-muted-foreground">
              Aucune règle ne correspond aux filtres appliqués.
            </div>
          )}

          {!authLoading && !user && (
            <p className="text-sm text-muted-foreground">
              Connectez-vous pour retrouver et gérer vos règles personnalisées
              dans ce lobby.
            </p>
          )}

          {user && customRules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Vous n'avez pas encore de règle personnalisée. Créez-en une pour
              enrichir ce lobby !
            </p>
          )}

          {hasSelectedPresetRules && (
            <div className="text-sm text-muted-foreground">
              {selectedPresetRuleIds.size} règle(s) préinstallée(s)
              sélectionnée(s).
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={playOptionsOpen}
        onOpenChange={(open) => {
          setPlayOptionsOpen(open);
          if (!open && !isQuickPlayOnline) {
            setSelectedQuickPlayEntry(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choisissez votre mode de jeu</DialogTitle>
            <DialogDescription>
              Sélectionnez comment vous souhaitez lancer «{" "}
              {selectedQuickPlayEntry?.rule.ruleName ?? "cette variante"} ».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Cadence de jeu</p>
              <p className="text-xs text-muted-foreground">
                Choisissez le rythme avant de lancer votre partie.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {timeControlEntries.map(([value, meta]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={selectedTimeControl === value ? "gold" : "outline"}
                    className="h-auto justify-start gap-2 py-3"
                    onClick={() => setSelectedTimeControl(value)}
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-white">
                        {meta.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {meta.description}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <Button
                variant="outline"
                className="justify-start gap-3"
                onClick={() => handleQuickPlayModeSelect("ai")}
              >
                <Bot className="h-4 w-4" />
                Contre l'IA
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-3"
                onClick={() => handleQuickPlayModeSelect("local")}
              >
                <Users className="h-4 w-4" />
                Partie locale
              </Button>
              <Button
                variant="gold"
                className="justify-start gap-3"
                onClick={() => handleQuickPlayModeSelect("online")}
                disabled={quickPlayOnlineLoading}
              >
                {quickPlayOnlineLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                Jouer en ligne
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={waitingDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setWaitingDialogOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recherche d'adversaire</DialogTitle>
            <DialogDescription>
              Nous attendons qu'un joueur rejoigne votre partie «{" "}
              {activeLobby
                ? getRuleLabel((activeLobby.active_rules ?? [])[0] ?? "")
                : (selectedQuickPlayEntry?.rule.ruleName ?? "Variante")}{" "}
              ».
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-center text-sm text-muted-foreground">
              Cette fenêtre se fermera automatiquement dès qu'un adversaire aura
              rejoint votre défi.
            </p>
            <div className="w-full">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCancelLobby}
                disabled={quickPlayOnlineLoading || !activeLobby}
              >
                Annuler la recherche
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </NeonBackground>
  );
};

export default Lobby;
