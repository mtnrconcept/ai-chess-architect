import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChessRule } from '@/types/chess';
import RuleCard from '@/components/RuleCard';
import { allPresetRules } from '@/lib/presetRules';

const Lobby = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customRules, setCustomRules] = useState<ChessRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const { data, error } = await supabase
        .from('custom_chess_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const rules: ChessRule[] = (data || []).map(r => ({
        id: r.id,
        ruleId: r.rule_id,
        ruleName: r.rule_name,
        description: r.description,
        category: r.category as any,
        affectedPieces: r.affected_pieces,
        trigger: r.trigger as any,
        conditions: r.conditions as any,
        effects: r.effects as any,
        priority: r.priority || 1,
        isActive: r.is_active || false,
        validationRules: r.validation_rules as any,
        createdAt: r.created_at
      }));

      setCustomRules(rules);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les règles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('custom_chess_rules')
        .delete()
        .eq('rule_id', ruleId);

      if (error) throw error;

      toast({ title: "Règle supprimée" });
      fetchRules();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la règle",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Lobby des Règles
          </h1>
          <div className="w-24" />
        </div>

        <Tabs defaultValue="custom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">Mes Règles ({customRules.length})</TabsTrigger>
            <TabsTrigger value="preset">Règles Préinstallées (40)</TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customRules.map(rule => (
                <RuleCard key={rule.ruleId} rule={rule} onDelete={deleteRule} />
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
              {allPresetRules.map(rule => (
                <RuleCard key={rule.ruleId} rule={rule} showActions={false} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Lobby;
