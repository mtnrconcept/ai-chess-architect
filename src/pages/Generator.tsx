import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Sparkles, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseFunctionErrorMessage } from '@/integrations/supabase/errors';
import { useToast } from '@/hooks/use-toast';
import { ChessRule } from '@/types/chess';
import RuleCard from '@/components/RuleCard';
import { useAuth } from '@/contexts/AuthContext';

const Generator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<ChessRule | null>(null);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <Card className="max-w-xl w-full bg-card/80 backdrop-blur">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-3xl font-bold">Connexion requise</CardTitle>
            <CardDescription>
              Créez un compte ou connectez-vous pour générer et sauvegarder des règles personnalisées.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild variant="premium" className="w-full">
              <Link to="/signup">Créer un compte</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/signup?mode=signin">Se connecter</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const generateRule = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer une description de règle",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-chess-rule', {
        body: { prompt }
      });

      if (error) throw error;

      if (data.rule) {
        const normalizedRule: ChessRule = {
          ...data.rule,
          tags: Array.isArray(data.rule.tags)
            ? data.rule.tags
                .map((tag: unknown) => typeof tag === 'string' ? tag.toLowerCase() : String(tag))
                .filter(tag => tag.length > 0)
            : [],
        };
        setGeneratedRule(normalizedRule);
        toast({
          title: "Succès !",
          description: "Règle générée avec succès",
        });
      }
    } catch (error: unknown) {
      console.error('Error generating rule:', error);
      const description = getSupabaseFunctionErrorMessage(
        error,
        "Erreur lors de la génération de la règle"
      );
      toast({
        title: "Erreur",
        description,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (!generatedRule) return;

    if (!user) {
      toast({
        title: "Erreur",
        description: "Vous devez être connecté pour sauvegarder une règle",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase.from('custom_chess_rules').insert({ 
        rule_id: generatedRule.ruleId,
        rule_name: generatedRule.ruleName,
        description: generatedRule.description,
        category: generatedRule.category,
        affected_pieces: generatedRule.affectedPieces,
        trigger: generatedRule.trigger,
        conditions: generatedRule.conditions as any,
        effects: generatedRule.effects as any,
        tags: generatedRule.tags,
        priority: generatedRule.priority,
        is_active: generatedRule.isActive,
        validation_rules: generatedRule.validationRules as any,
        user_id: user.id
      });

      if (error) throw error;

      toast({
        title: "Règle sauvegardée !",
        description: "La règle a été ajoutée au lobby",
      });

      setPrompt('');
      setGeneratedRule(null);
      navigate('/lobby');
    } catch (error: any) {
      console.error('Error saving rule:', error);
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la sauvegarde de la règle",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Générateur de Règles IA
          </h1>
          <div className="w-24" />
        </div>

        {/* Generator Card */}
        <Card className="bg-card/80 backdrop-blur-xl border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="text-primary" />
              Décrivez votre règle personnalisée
            </CardTitle>
            <CardDescription>
              Laissez l'IA créer une règle d'échecs unique basée sur votre description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Exemples :&#10;• Le cavalier peut se déplacer deux fois par tour&#10;• Les pions peuvent capturer en diagonale sur 2 cases&#10;• La reine peut téléporter n'importe où tous les 3 tours&#10;• Les tours peuvent sauter par-dessus une pièce alliée&#10;• Le roi gagne +1 case de mouvement après chaque capture"
              className="min-h-40 bg-background/50 resize-none"
            />
            
            <Button
              onClick={generateRule}
              disabled={loading || !prompt.trim()}
              variant="premium"
              className="w-full text-lg py-6"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={24} />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles size={24} />
                  Générer la règle avec l'IA
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Rule */}
        {generatedRule && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Règle Générée</h2>
              <Button onClick={saveRule} variant="gold" size="lg">
                <Save size={20} />
                Sauvegarder au Lobby
              </Button>
            </div>
            
            <RuleCard rule={generatedRule} showActions={false} />

            {/* JSON Preview */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-sm">Configuration JSON</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-muted-foreground overflow-x-auto bg-background/30 p-4 rounded-lg">
                  {JSON.stringify(generatedRule, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Generator;
