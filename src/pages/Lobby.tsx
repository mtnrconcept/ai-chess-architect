import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChessRule } from '@/types/chess';
import RuleCard from '@/components/RuleCard';
import { allPresetRules } from '@/lib/presetRules';
import { analyzeRuleLogic, RuleAnalysisResult } from '@/lib/ruleValidation';
import { useAuth } from '@/contexts/AuthContext';
import { mapCustomRuleRowsToChessRules, type CustomRuleRow } from '@/lib/customRuleMapper';

const Lobby = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [customRules, setCustomRules] = useState<ChessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleIssues, setRuleIssues] = useState<Record<string, string[]>>({});
  const [selectedPresetRuleIds, setSelectedPresetRuleIds] = useState<Set<string>>(new Set());
  const [activatingRules, setActivatingRules] = useState(false);

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

        <Tabs defaultValue="custom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">Mes Règles ({customRules.length})</TabsTrigger>
            <TabsTrigger value="preset">Règles Préinstallées ({allPresetRules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Chargement de vos règles personnalisées...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customRules.map(rule => (
                  <RuleCard
                    key={rule.ruleId}
                    rule={rule}
                    onDelete={deleteRule}
                    onToggle={toggleRuleStatus}
                    issues={ruleIssues[rule.ruleId]}
                  />
                ))}
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
              {presetAnalyses.map(({ rule, issues }) => (
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

