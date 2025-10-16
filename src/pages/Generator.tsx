import { useState, useMemo } from 'react';
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
import NeonBackground from '@/components/layout/NeonBackground';
import { useAuth } from '@/contexts/AuthContext';
import { analyzeRuleLogic } from '@/lib/ruleValidation';
import type { Database } from '@/integrations/supabase/types';

const PROMPT_MIN = 10;
const PROMPT_MAX = 800;
const INVOKE_TIMEOUT_MS = 15000; // 15s pour ne pas bloquer l’UI
const MAX_RETRIES = 2;

type InvokeResult =
  | { ok: true; payload: any }
  | { ok: false; error: Error; status?: number; details?: string[] };

const isRetriable = (status?: number, err?: unknown) => {
  if (!status) {
    // Erreurs réseau typiques (Edge down, CORS, socket close…)
    const name = (err as any)?.name || '';
    return name.includes('TypeError') || name.includes('FunctionsFetchError');
  }
  // 502 (gateway), 429 (ratelimit), 503 (provider indispo) -> retry
  return status === 502 || status === 429 || status === 503;
};

async function invokeWithTimeoutAndRetry(
  fn: string,
  body: Record<string, unknown>,
  signalExternal?: AbortSignal
): Promise<InvokeResult> {
  let attempt = 0;
  let lastError: any = null;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), INVOKE_TIMEOUT_MS);

    // Chaîne les signaux si un AbortController externe est passé
    const onAbort = () => controller.abort('external-abort');
    signalExternal?.addEventListener('abort', onAbort, { once: true });

    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      signalExternal?.removeEventListener('abort', onAbort);

      if (error) {
        // `error` de supabase.functions.invoke peut contenir status
        const status = (error as any)?.context?.response?.status ?? (error as any)?.status;
        // payload data?.error éventuel traité par l’appelant
        if (isRetriable(status, error) && attempt < MAX_RETRIES) {
          attempt++;
          await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 300));
          continue;
        }
        return { ok: false, error, status };
      }

      return { ok: true, payload: data };
    } catch (err: any) {
      clearTimeout(timer);
      signalExternal?.removeEventListener('abort', onAbort);

      const status: number | undefined = err?.context?.response?.status ?? err?.status;
      lastError = err;

      if (isRetriable(status, err) && attempt < MAX_RETRIES) {
        attempt++;
        await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 300));
        continue;
      }
      return { ok: false, error: err, status };
    }
  }

  return { ok: false, error: lastError ?? new Error('Unknown failure') };
}

const Generator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<ChessRule | null>(null);
  const [generatedIssues, setGeneratedIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const promptTooShort = useMemo(() => prompt.trim().length > 0 && prompt.trim().length < PROMPT_MIN, [prompt]);
  const promptTooLong = useMemo(() => prompt.trim().length > PROMPT_MAX, [prompt]);

  if (authLoading) {
    return (
      <NeonBackground contentClassName="px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </NeonBackground>
    );
  }

  if (!user) {
    return (
      <NeonBackground contentClassName="px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-xl bg-card/80 backdrop-blur">
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
      </NeonBackground>
    );
  }

  const generateRule = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer une description de règle',
        variant: 'destructive',
      });
      return;
    }
    if (trimmed.length < PROMPT_MIN || trimmed.length > PROMPT_MAX) {
      toast({
        title: 'Validation',
        description: `Le prompt doit contenir entre ${PROMPT_MIN} et ${PROMPT_MAX} caractères.`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setGeneratedIssues([]);
    setGeneratedRule(null);

    try {
      const aborter = new AbortController();

      const res = await invokeWithTimeoutAndRetry(
        'generate-chess-rule',
        { prompt: trimmed },
        aborter.signal
      );

      if (!res.ok) {
        const description = getSupabaseFunctionErrorMessage(
          res.error,
          'Erreur lors de la génération de la règle'
        );
        toast({ title: 'Erreur', description, variant: 'destructive' });
        return;
      }

      const data = res.payload;

      // La fonction renvoie { rule: ... } OU { ok:true, data:{rule:...} } selon variante backend.
      const ruleEnvelope = data?.rule ?? data?.data?.rule ?? data;
      if (!ruleEnvelope) {
        toast({
          title: 'Erreur',
          description: "Réponse inattendue du générateur (aucune règle reçue).",
          variant: 'destructive',
        });
        return;
      }

      if (data?.error) {
        // Cas où la fonction renvoie { error, details? }
        const detailsJoined = Array.isArray(data.details)
          ? data.details
              .map((d: any) => {
                if (!d) return null;
                if (typeof d === 'string') return d;
                if (typeof d === 'object') {
                  const m = 'message' in d ? (d.message as string) : '';
                  const p = 'path' in d ? (d.path as string) : '';
                  return (p ? `${p}: ` : '') + (m || '');
                }
                return null;
              })
              .filter(Boolean)
              .join(' — ')
          : undefined;

        throw new Error(detailsJoined?.length ? detailsJoined : String(data.error));
      }

      let rawRule: unknown = ruleEnvelope;

      if (typeof rawRule === 'string') {
        try {
          rawRule = JSON.parse(rawRule);
        } catch (parseError) {
          console.warn('[generator] Règle renvoyée STRING non parsable.', parseError);
          throw new Error('La règle générée est invalide (JSON non parsable).');
        }
      }

      const { rule, issues } = analyzeRuleLogic(rawRule);
      const normalizedRule: ChessRule = {
        ...rule,
        tags: Array.isArray(rule.tags)
          ? rule.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
          : [],
      };

      setGeneratedRule(normalizedRule);
      setGeneratedIssues(issues);

      const adjustmentsSummary =
        issues.length > 0
          ? `Ajustements appliqués : ${issues.slice(0, 2).join(' • ')}${issues.length > 2 ? '…' : ''}`
          : 'Règle générée avec succès';

      toast({ title: 'Succès !', description: adjustmentsSummary });
    } catch (error: unknown) {
      console.error('Error generating rule:', error);
      const description = getSupabaseFunctionErrorMessage(
        error,
        'Erreur lors de la génération de la règle'
      );
      toast({ title: 'Erreur', description, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (!generatedRule) return;

    if (!user) {
      toast({
        title: 'Erreur',
        description: 'Vous devez être connecté pour sauvegarder une règle',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const sanitizedTags = Array.isArray(generatedRule.tags)
        ? generatedRule.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
        : [];

      const rulePayload: Database['public']['Tables']['custom_chess_rules']['Insert'] = {
        rule_id: generatedRule.ruleId,
        rule_name: generatedRule.ruleName,
        description: generatedRule.description,
        category: generatedRule.category,
        affected_pieces: generatedRule.affectedPieces as any,
        trigger: generatedRule.trigger,
        conditions: generatedRule.conditions as any,
        effects: generatedRule.effects as any,
        priority: generatedRule.priority,
        is_active: generatedRule.isActive,
        validation_rules: generatedRule.validationRules as any,
        user_id: user.id,
      };

      if (sanitizedTags.length > 0) {
        (rulePayload as any).tags = sanitizedTags;
      }

      const { error } = await supabase.from('custom_chess_rules').insert(rulePayload);

      let savedWithFallback = false;

      if (error) {
        const missingTagsColumn =
          typeof error.message === 'string' &&
          error.message.toLowerCase().includes("'tags' column");

        if (missingTagsColumn && Array.isArray((rulePayload as any).tags) && (rulePayload as any).tags.length > 0) {
          console.warn('Tags column missing in schema, retrying without tags', error);
          const { tags: _removedTags, ...payloadWithoutTags } = rulePayload as any;
          const { error: retryError } = await supabase
            .from('custom_chess_rules')
            .insert(payloadWithoutTags as Database['public']['Tables']['custom_chess_rules']['Insert']);

          if (retryError) {
            throw retryError;
          }

          savedWithFallback = true;
        } else {
          throw error;
        }
      }

      toast({
        title: 'Règle sauvegardée !',
        description: savedWithFallback
          ? "La règle a été ajoutée au lobby, mais les tags n'ont pas pu être enregistrés car la base de données n'est pas à jour."
          : 'La règle a été ajoutée au lobby',
      });

      setPrompt('');
      setGeneratedRule(null);
      setGeneratedIssues([]);
      navigate('/lobby');
    } catch (error: any) {
      console.error('Error saving rule:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Erreur lors de la sauvegarde de la règle',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <NeonBackground contentClassName="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} disabled={loading || saving}>
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
              Laissez l&apos;IA créer une règle d&apos;échecs unique basée sur votre description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                `Exemples :\n• Le cavalier peut se déplacer deux fois par tour` +
                `\n• Les pions peuvent capturer en diagonale sur 2 cases` +
                `\n• La reine peut téléporter n'importe où tous les 3 tours` +
                `\n• Les tours peuvent sauter par-dessus une pièce alliée` +
                `\n• Le roi gagne +1 case de mouvement après chaque capture`
              }
              className="min-h-40 bg-background/50 resize-none"
              disabled={loading}
            />
            <div className="text-xs text-muted-foreground">
              {promptTooShort && <span>Minimum {PROMPT_MIN} caractères.</span>}
              {promptTooLong && <span>Maximum {PROMPT_MAX} caractères.</span>}
            </div>

            <Button
              onClick={generateRule}
              disabled={loading || saving || !prompt.trim() || promptTooShort || promptTooLong}
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
                  Générer la règle avec l&apos;IA
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
              <Button onClick={saveRule} variant="gold" size="lg" disabled={saving}>
                {saving ? <Loader2 className="mr-2 animate-spin" size={20} /> : <Save size={20} />}
                {saving ? 'Sauvegarde...' : 'Sauvegarder au Lobby'}
              </Button>
            </div>

            <RuleCard rule={generatedRule} showActions={false} issues={generatedIssues} />

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
    </NeonBackground>
  );
};

export default Generator;
