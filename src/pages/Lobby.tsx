import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChessRule } from '@/types/chess';
import RuleCard from '@/components/RuleCard';
import { allPresetRules } from '@/lib/presetRules';
import { analyzeRuleLogic, RuleAnalysisResult } from '@/lib/ruleValidation';
import type { Tables } from '@/integrations/supabase/types';

type CustomRuleRow = Tables<'custom_chess_rules'>;

const Lobby = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customRules, setCustomRules] = useState<ChessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleIssues, setRuleIssues] = useState<Record<string, string[]>>({});

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('custom_chess_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as CustomRuleRow[];

      const analyses: RuleAnalysisResult[] = rows.map(row => {
        const baseRule: ChessRule = {
          id: row.id,
          ruleId: row.rule_id,
          ruleName: row.rule_name,
          description: row.description,
          category: row.category as ChessRule['category'],
          affectedPieces: row.affected_pieces as unknown as string[],
          trigger: row.trigger as ChessRule['trigger'],
          conditions: row.conditions as unknown,
          effects: row.effects as unknown,
          priority: row.priority ?? 1,
          isActive: row.is_active ?? false,
          validationRules: row.validation_rules as unknown,
          createdAt: row.created_at,
        };

        return analyzeRuleLogic(baseRule);
      });

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
  }, [toast]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('custom_chess_rules')
        .delete()
        .eq('rule_id', ruleId);

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
    try {
      const { error } = await supabase
        .from('custom_chess_rules')
        .update({ is_active: isActive })
        .eq('rule_id', ruleId);

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

  const handlePlayWithCustomRules = () => {
    const activeRules = customRules.filter(rule => rule.isActive);

    if (activeRules.length === 0) {
      toast({
        title: 'Aucune règle active',
        description: 'Activez au moins une règle personnalisée avant de lancer une partie.',
        variant: 'destructive',
      });
      return;
    }

    navigate('/play', { state: { customRules: activeRules } });
  };

  const hasActiveCustomRule = customRules.some(rule => rule.isActive);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Lobby des Règles
          </h1>
          <div className="flex justify-end w-48">
            <Button
              variant="outline"
              onClick={handlePlayWithCustomRules}
              disabled={!hasActiveCustomRule}
            >
              Jouer avec mes règles
            </Button>
          </div>
        </div>

        <Tabs defaultValue="custom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">Mes Règles ({customRules.length})</TabsTrigger>
            <TabsTrigger value="preset">Règles Préinstallées (40)</TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="mt-6">
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
              {customRules.length === 0 && !loading && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  Aucune règle personnalisée. Créez-en une !
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="preset" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {presetAnalyses.map(({ rule, issues }) => (
                <RuleCard
                  key={rule.ruleId}
                  rule={rule}
                  showActions={false}
                  issues={issues}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Lobby;

