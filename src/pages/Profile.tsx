import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LogOut, RefreshCcw, Sparkles, UserCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RuleCard from '@/components/RuleCard';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { ChessRule, RuleCondition, RuleEffect } from '@/types/chess';

type CustomRuleRow = Tables<'custom_chess_rules'>;

const defaultValidation: ChessRule['validationRules'] = {
  allowedWith: [],
  conflictsWith: [],
  requiredState: null,
};

const parseConditions = (conditions: CustomRuleRow['conditions']): RuleCondition[] => {
  if (!conditions) return [];
  if (Array.isArray(conditions)) return conditions as RuleCondition[];
  return [];
};

const parseEffects = (effects: CustomRuleRow['effects']): RuleEffect[] => {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects as RuleEffect[];
  return [];
};

const parseValidation = (
  validation: CustomRuleRow['validation_rules']
): ChessRule['validationRules'] => {
  if (!validation || typeof validation !== 'object') {
    return defaultValidation;
  }

  const value = validation as Partial<ChessRule['validationRules']>;
  return {
    allowedWith: Array.isArray(value.allowedWith) ? value.allowedWith : [],
    conflictsWith: Array.isArray(value.conflictsWith) ? value.conflictsWith : [],
    requiredState: value.requiredState ?? null,
  };
};

const mapRuleRowToChessRule = (row: CustomRuleRow): ChessRule => ({
  id: row.id,
  ruleId: row.rule_id,
  ruleName: row.rule_name,
  description: row.description,
  category: row.category as ChessRule['category'],
  affectedPieces: row.affected_pieces ?? [],
  trigger: row.trigger as ChessRule['trigger'],
  conditions: parseConditions(row.conditions),
  effects: parseEffects(row.effects),
  priority: row.priority ?? 0,
  isActive: row.is_active ?? true,
  validationRules: parseValidation(row.validation_rules),
  userId: row.user_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const Profile = () => {
  const { user, loading: authLoading, signOut, refreshUser } = useAuth();
  const { toast } = useToast();
  const [rules, setRules] = useState<ChessRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  const userInitials = useMemo(() => {
    if (!user?.email) return 'U';
    return user.email.slice(0, 2).toUpperCase();
  }, [user?.email]);

  const lastUpdated = useMemo(() => {
    if (rules.length === 0) return null;
    const candidate = rules[0].createdAt ?? rules[0].updatedAt;
    if (!candidate) return null;
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('fr-FR');
  }, [rules]);

  const fetchRules = async () => {
    if (!user) return;

    setLoadingRules(true);

    try {
      const { data, error } = await supabase
        .from('custom_chess_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRules((data ?? []).map(mapRuleRowToChessRule));
    } catch (error: any) {
      console.error('Error loading rules:', error);
      toast({
        title: 'Erreur lors du chargement',
        description: error.message || 'Impossible de récupérer vos règles.',
        variant: 'destructive',
      });
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRules();
    } else if (!authLoading) {
      setLoadingRules(false);
    }
  }, [user, authLoading]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: 'Déconnexion réussie',
        description: 'À bientôt sur Chess Rules Engine !',
      });
      await refreshUser();
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast({
        title: 'Erreur lors de la déconnexion',
        description: error.message || 'Veuillez réessayer ultérieurement.',
        variant: 'destructive',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-card/80 backdrop-blur">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl">Profil indisponible</CardTitle>
            <CardDescription>
              Connectez-vous ou créez un compte pour personnaliser vos règles d'échecs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild variant="premium" className="w-full">
              <Link to="/signup">Créer mon compte</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/signup?mode=signin">Se connecter</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-semibold">
              {userInitials}
            </div>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <UserCircle className="h-7 w-7" />
                Mon profil
              </h1>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchRules} variant="outline" disabled={loadingRules}>
              {loadingRules ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Actualiser
            </Button>
            <Button onClick={handleSignOut} variant="ghost" className="text-destructive hover:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Se déconnecter
            </Button>
          </div>
        </div>

        <Card className="bg-card/80 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Mes règles personnalisées
            </CardTitle>
            <CardDescription>
              Retrouvez ici les règles générées et sauvegardées avec votre compte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingRules ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center space-y-3 py-10">
                <p className="text-lg font-medium">Aucune règle sauvegardée pour le moment.</p>
                <p className="text-sm text-muted-foreground">
                  Utilisez le générateur de règles pour créer votre première règle personnalisée.
                </p>
                <Button asChild variant="premium" className="mt-2">
                  <Link to="/generator">Créer une règle</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{rules.length} règle(s)</Badge>
                  {lastUpdated && (
                    <Badge variant="secondary">Dernière mise à jour : {lastUpdated}</Badge>
                  )}
                </div>
                <div className="grid gap-4">
                  {rules.map((rule) => (
                    <RuleCard key={rule.id ?? rule.ruleId} rule={rule} showActions={false} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
