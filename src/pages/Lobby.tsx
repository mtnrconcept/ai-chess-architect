import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, ChevronDown, Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChessRule } from '@/types/chess';
import RuleCard from '@/components/RuleCard';
import { allPresetRules } from '@/lib/presetRules';
import { analyzeRuleLogic, RuleAnalysisResult } from '@/lib/ruleValidation';
import { useAuth } from '@/contexts/AuthContext';
import { mapCustomRuleRowsToChessRules, type CustomRuleRow } from '@/lib/customRuleMapper';

type StatusFilterValue = 'all' | 'active' | 'inactive';
type IssueFilterValue = 'all' | 'withIssues' | 'withoutIssues';

const Lobby = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [customRules, setCustomRules] = useState<ChessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleIssues, setRuleIssues] = useState<Record<string, string[]>>({});
  const [selectedPresetRuleIds, setSelectedPresetRuleIds] = useState<Set<string>>(new Set());
  const [activatingRules, setActivatingRules] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<ChessRule['category']>>(new Set());
  const [selectedTriggers, setSelectedTriggers] = useState<Set<ChessRule['trigger']>>(new Set());
  const [selectedPieces, setSelectedPieces] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [issueFilter, setIssueFilter] = useState<IssueFilterValue>('all');

  const fetchRules = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setCustomRules([]);
      setRuleIssues({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('custom_chess_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as CustomRuleRow[];
      const mappedRules = mapCustomRuleRowsToChessRules(rows);

      const analyses: RuleAnalysisResult[] = mappedRules.map(rule =>
        analyzeRuleLogic(rule)
      );

      const issues = Object.fromEntries(
        analyses.map(result => [result.rule.ruleId, result.issues])
      );

      setRuleIssues(issues);
      setCustomRules(analyses.map(result => result.rule));
    } catch (error: unknown) {
      const description = error instanceof Error
        ? error.message
        : "Impossible de charger les règles";
      toast({
        title: 'Erreur',
        description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [authLoading, toast, user]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const deleteRule = async (ruleId: string) => {
    if (!user) {
      toast({
        title: 'Connexion requise',
        description: 'Connectez-vous pour gérer vos règles personnalisées.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_chess_rules')
        .delete()
        .eq('rule_id', ruleId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({ title: 'Règle supprimée' });
      fetchRules();
    } catch (error: unknown) {
      const description = error instanceof Error
        ? error.message
        : "Impossible de supprimer la règle";
      toast({
        title: 'Erreur',
        description,
        variant: 'destructive',
      });
    }
  };

  const toggleRuleStatus = async (ruleId: string, isActive: boolean) => {
    if (!user) {
      toast({
        title: 'Connexion requise',
        description: 'Connectez-vous pour gérer vos règles personnalisées.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_chess_rules')
        .update({ is_active: isActive })
        .eq('rule_id', ruleId)
        .eq('user_id', user.id);

      if (error) throw error;

      setCustomRules(prev => prev.map(rule =>
        rule.ruleId === ruleId ? { ...rule, isActive } : rule
      ));

      toast({
        title: isActive ? 'Règle activée' : 'Règle désactivée',
      });
    } catch (error: unknown) {
      const description = error instanceof Error
        ? error.message
        : "Impossible de mettre à jour la règle";
      toast({
        title: 'Erreur',
        description,
        variant: 'destructive',
      });
    }
  };

  const presetAnalyses = useMemo(
    () => allPresetRules.map(rule => analyzeRuleLogic(rule)),
    []
  );

  const priorityBounds = useMemo(() => {
    const allRules = [
      ...customRules,
      ...presetAnalyses.map(({ rule }) => rule),
    ];

    if (allRules.length === 0) {
      return { min: 0, max: 10 } as const;
    }

    const priorities = allRules.map(rule => (
      typeof rule.priority === 'number' ? rule.priority : Number(rule.priority ?? 0)
    ) || 0);

    const min = Math.min(...priorities);
    const max = Math.max(...priorities);

    return { min, max: Math.max(min, max) } as const;
  }, [customRules, presetAnalyses]);

  const [priorityRange, setPriorityRange] = useState<[number, number]>([
    priorityBounds.min,
    priorityBounds.max,
  ]);

  useEffect(() => {
    setPriorityRange(prev => {
      if (prev[0] === priorityBounds.min && prev[1] === priorityBounds.max) {
        return prev;
      }
      return [priorityBounds.min, priorityBounds.max];
    });
  }, [priorityBounds.min, priorityBounds.max]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    customRules.forEach(rule => {
      rule.tags?.forEach(tag => tags.add(tag.toLowerCase()));
    });
    presetAnalyses.forEach(({ rule }) => {
      rule.tags?.forEach(tag => tags.add(tag.toLowerCase()));
    });
    return Array.from(tags).sort();
  }, [customRules, presetAnalyses]);

  const availableCategories = useMemo(() => {
    const categories = new Set<ChessRule['category']>();
    customRules.forEach(rule => categories.add(rule.category));
    presetAnalyses.forEach(({ rule }) => categories.add(rule.category));
    return Array.from(categories).sort();
  }, [customRules, presetAnalyses]);

  const availableTriggers = useMemo(() => {
    const triggers = new Set<ChessRule['trigger']>();
    customRules.forEach(rule => triggers.add(rule.trigger));
    presetAnalyses.forEach(({ rule }) => triggers.add(rule.trigger));
    return Array.from(triggers).sort();
  }, [customRules, presetAnalyses]);

  const availablePieces = useMemo(() => {
    const pieces = new Set<string>();
    const addPieces = (rule: ChessRule) => {
      rule.affectedPieces?.forEach(piece => {
        if (typeof piece === 'string') {
          pieces.add(piece.toLowerCase());
        }
      });
    };

    customRules.forEach(addPieces);
    presetAnalyses.forEach(({ rule }) => addPieces(rule));

    const order = ['all', 'king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

    return Array.from(pieces).sort((a, b) => {
      const indexA = order.indexOf(a);
      const indexB = order.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [customRules, presetAnalyses]);

  const categoryLabels: Record<ChessRule['category'], string> = {
    movement: 'Mouvement',
    capture: 'Attaque',
    special: 'Spécial',
    condition: 'Condition',
    victory: 'Victoire',
    restriction: 'Restriction',
    defense: 'Défense',
    behavior: 'Comportement',
    vip: 'VIP · Magnus Goat',
  };

  const triggerLabels: Record<ChessRule['trigger'], string> = {
    always: 'Toujours',
    onMove: 'Lors d\'un mouvement',
    onCapture: 'Lors d\'une capture',
    onCheck: 'Lors d\'un échec',
    onCheckmate: 'Lors d\'un mat',
    turnBased: 'Selon le tour',
    conditional: 'Conditionnel',
  };

  const pieceLabels: Record<string, string> = {
    all: 'Toutes les pièces',
    king: 'Roi',
    queen: 'Reine',
    rook: 'Tour',
    bishop: 'Fou',
    knight: 'Cavalier',
    pawn: 'Pion',
  };

  const filteredCustomRules = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return customRules.filter(rule => {
      const ruleTags = new Set(rule.tags?.map(tag => tag.toLowerCase()) ?? []);
      const matchesTags = selectedTags.size === 0 || Array.from(selectedTags).every(tag => ruleTags.has(tag));
      if (!matchesTags) return false;

      const matchesCategories = selectedCategories.size === 0 || selectedCategories.has(rule.category);
      if (!matchesCategories) return false;

      const matchesTriggers = selectedTriggers.size === 0 || selectedTriggers.has(rule.trigger);
      if (!matchesTriggers) return false;

      const normalizedPieces = new Set((rule.affectedPieces ?? []).map(piece => piece.toLowerCase()));
      const matchesPieces = selectedPieces.size === 0 || Array.from(selectedPieces).every(piece =>
        normalizedPieces.has(piece) || normalizedPieces.has('all')
      );
      if (!matchesPieces) return false;

      const matchesPriority = rule.priority >= priorityRange[0] && rule.priority <= priorityRange[1];
      if (!matchesPriority) return false;

      const issueCount = ruleIssues[rule.ruleId]?.length ?? 0;
      if (issueFilter === 'withIssues' && issueCount === 0) return false;
      if (issueFilter === 'withoutIssues' && issueCount > 0) return false;

      if (statusFilter === 'active' && !rule.isActive) return false;
      if (statusFilter === 'inactive' && rule.isActive) return false;

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
          .map(value => value.toString().toLowerCase());

        const matchesQuery = haystack.some(value => value.includes(normalizedQuery));
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
      const ruleTags = new Set(rule.tags?.map(tag => tag.toLowerCase()) ?? []);
      const matchesTags = selectedTags.size === 0 || Array.from(selectedTags).every(tag => ruleTags.has(tag));
      if (!matchesTags) return false;

      const matchesCategories = selectedCategories.size === 0 || selectedCategories.has(rule.category);
      if (!matchesCategories) return false;

      const matchesTriggers = selectedTriggers.size === 0 || selectedTriggers.has(rule.trigger);
      if (!matchesTriggers) return false;

      const normalizedPieces = new Set((rule.affectedPieces ?? []).map(piece => piece.toLowerCase()));
      const matchesPieces = selectedPieces.size === 0 || Array.from(selectedPieces).every(piece =>
        normalizedPieces.has(piece) || normalizedPieces.has('all')
      );
      if (!matchesPieces) return false;

      const matchesPriority = rule.priority >= priorityRange[0] && rule.priority <= priorityRange[1];
      if (!matchesPriority) return false;

      if (issueFilter === 'withIssues' && issues.length === 0) return false;
      if (issueFilter === 'withoutIssues' && issues.length > 0) return false;

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
          .map(value => value.toString().toLowerCase());

        const matchesQuery = haystack.some(value => value.includes(normalizedQuery));
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
  ]);

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => {
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
    setSearchQuery('');
    setSelectedCategories(new Set());
    setSelectedTriggers(new Set());
    setSelectedPieces(new Set());
    setStatusFilter('all');
    setIssueFilter('all');
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
      statusFilter !== 'all' ||
      issueFilter !== 'all' ||
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

  const handleCategoryToggle = (category: ChessRule['category'], shouldSelect: boolean) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (shouldSelect) {
        next.add(category);
      } else {
        next.delete(category);
      }
      return next;
    });
  };

  const handleTriggerToggle = (trigger: ChessRule['trigger'], shouldSelect: boolean) => {
    setSelectedTriggers(prev => {
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
    setSelectedPieces(prev => {
      const next = new Set(prev);
      if (shouldSelect) {
        next.add(normalized);
      } else {
        next.delete(normalized);
      }
      return next;
    });
  };

  const togglePresetRule = (ruleId: string, shouldSelect?: boolean) => {
    setSelectedPresetRuleIds(prev => {
      const next = new Set(prev);
      const willSelect = typeof shouldSelect === 'boolean' ? shouldSelect : !next.has(ruleId);

      if (willSelect) {
        next.add(ruleId);
      } else {
        next.delete(ruleId);
      }

      return next;
    });
  };

  const handleActivateAllCustomRules = async () => {
    if (!user) {
      toast({
        title: 'Connexion requise',
        description: 'Connectez-vous pour gérer vos règles personnalisées.',
        variant: 'destructive',
      });
      return;
    }

    const inactiveRuleIds = customRules
      .filter(rule => !rule.isActive)
      .map(rule => rule.ruleId);

    if (inactiveRuleIds.length === 0) {
      toast({
        title: 'Toutes vos règles sont déjà actives',
      });
      return;
    }

    setActivatingRules(true);
    try {
      const { error } = await supabase
        .from('custom_chess_rules')
        .update({ is_active: true })
        .eq('user_id', user.id)
        .in('rule_id', inactiveRuleIds);

      if (error) throw error;

      setCustomRules(prev => prev.map(rule => ({ ...rule, isActive: true })));

      toast({
        title: 'Règles activées',
        description: `${inactiveRuleIds.length} règle(s) personnalisée(s) activée(s).`,
      });
    } catch (error: unknown) {
      const description = error instanceof Error
        ? error.message
        : 'Impossible d\'activer les règles';
      toast({
        title: 'Erreur',
        description,
        variant: 'destructive',
      });
    } finally {
      setActivatingRules(false);
    }
  };

  const handleStartGame = () => {
    const activeRules = customRules.filter(rule => rule.isActive);
    const selectedPresetIds = Array.from(selectedPresetRuleIds);

    if (activeRules.length === 0 && selectedPresetIds.length === 0) {
      toast({
        title: 'Aucune règle sélectionnée',
        description: 'Activez vos règles personnalisées ou sélectionnez des règles préinstallées avant de lancer une partie.',
        variant: 'destructive',
      });
      return;
    }

    navigate('/play', {
      state: {
        customRules: activeRules,
        presetRuleIds: selectedPresetIds,
      },
    });
  };

  const hasActiveCustomRule = customRules.some(rule => rule.isActive);
  const hasSelectedPresetRules = selectedPresetRuleIds.size > 0;
  const hasInactiveCustomRules = customRules.some(rule => !rule.isActive);
  const canStartGame = hasActiveCustomRule || hasSelectedPresetRules;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Lobby des Règles
          </h1>
          <div className="flex flex-wrap justify-end gap-2">
            {user && customRules.length > 0 && (
              <Button
                variant="gold"
                onClick={handleActivateAllCustomRules}
                disabled={activatingRules || !hasInactiveCustomRules}
              >
                {activatingRules && <Loader2 className="h-4 w-4 animate-spin" />}
                Activer mes règles
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleStartGame}
              disabled={!canStartGame}
            >
              Lancer la partie
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="w-full md:max-w-md">
              <Label htmlFor="rule-search" className="text-xs uppercase tracking-wide text-muted-foreground">
                Recherche intelligente
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="rule-search"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
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
                    {selectedCategories.size > 0 ? `${selectedCategories.size} sélectionnée(s)` : 'Toutes'}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Catégories de règles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableCategories.map(category => (
                  <DropdownMenuCheckboxItem
                    key={category}
                    checked={selectedCategories.has(category)}
                    onCheckedChange={checked => handleCategoryToggle(category, checked === true)}
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
                    {selectedTriggers.size > 0 ? `${selectedTriggers.size} sélectionné(s)` : 'Tous'}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Déclencheurs disponibles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTriggers.map(trigger => (
                  <DropdownMenuCheckboxItem
                    key={trigger}
                    checked={selectedTriggers.has(trigger)}
                    onCheckedChange={checked => handleTriggerToggle(trigger, checked === true)}
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
                    {selectedPieces.size > 0 ? `${selectedPieces.size} sélectionnée(s)` : 'Toutes'}
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel>Pièces ciblées</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availablePieces.map(piece => (
                  <DropdownMenuCheckboxItem
                    key={piece}
                    checked={selectedPieces.has(piece)}
                    onCheckedChange={checked => handlePieceToggle(piece, checked === true)}
                  >
                    {pieceLabels[piece] ?? piece}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select value={statusFilter} onValueChange={value => setStatusFilter(value as StatusFilterValue)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Statut (perso)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actives uniquement</SelectItem>
                <SelectItem value="inactive">Inactives uniquement</SelectItem>
              </SelectContent>
            </Select>

            <Select value={issueFilter} onValueChange={value => setIssueFilter(value as IssueFilterValue)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualité des règles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les règles</SelectItem>
                <SelectItem value="withIssues">Avec anomalies détectées</SelectItem>
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
              onValueChange={value => setPriorityRange([value[0], value[1]])}
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
                <span className="text-sm font-semibold text-muted-foreground">Filtrer par tags :</span>
                {availableTags.map(tag => {
                  const normalized = tag.toLowerCase();
                  const isActive = selectedTags.has(normalized);
                  return (
                    <Button
                      key={normalized}
                      size="sm"
                      variant={isActive ? 'premium' : 'outline'}
                      className="rounded-full px-3 py-1 text-xs uppercase tracking-wide"
                      onClick={() => toggleTagFilter(tag)}
                    >
                      #{tag}
                    </Button>
                  );
                })}
                {selectedTags.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearTagFilters}>
                    Réinitialiser les tags
                  </Button>
                )}
              </div>
              {selectedTags.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedTags.size} tag(s) actif(s) · {filteredCustomRules.length + filteredPresetAnalyses.length} règle(s) correspondante(s)
                </p>
              )}
            </div>
          )}
        </div>

        <Tabs defaultValue="custom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">Mes Règles ({filteredCustomRules.length}/{customRules.length})</TabsTrigger>
            <TabsTrigger value="preset">Règles Préinstallées ({filteredPresetAnalyses.length}/{allPresetRules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Chargement de vos règles personnalisées...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCustomRules.map(rule => (
                  <RuleCard
                    key={rule.ruleId}
                    rule={rule}
                    onDelete={deleteRule}
                    onToggle={toggleRuleStatus}
                    issues={ruleIssues[rule.ruleId]}
                  />
                ))}
                {filteredCustomRules.length === 0 && customRules.length > 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    Aucune règle ne correspond aux tags sélectionnés.
                  </div>
                )}
                {!authLoading && !user && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    Connectez-vous pour retrouver vos règles personnalisées.
                  </div>
                )}
                {user && customRules.length === 0 && (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    Aucune règle personnalisée. Créez-en une !
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="preset" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPresetAnalyses.map(({ rule, issues }) => (
                <RuleCard
                  key={rule.ruleId}
                  rule={rule}
                  showActions={false}
                  issues={issues}
                  selectable
                  isSelected={selectedPresetRuleIds.has(rule.ruleId)}
                  onSelectChange={selected => togglePresetRule(rule.ruleId, selected)}
                />
              ))}
              {filteredPresetAnalyses.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  Aucun preset ne correspond aux tags sélectionnés.
                </div>
              )}
            </div>
            {hasSelectedPresetRules && (
              <div className="mt-4 text-sm text-muted-foreground">
                {selectedPresetRuleIds.size} règle(s) préinstallée(s) sélectionnée(s).
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Lobby;

