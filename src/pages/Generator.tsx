import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseFunctionErrorMessage } from "@/integrations/supabase/errors";
import { useToast } from "@/hooks/use-toast";
import { ChessRule } from "@/types/chess";
import RuleCard from "@/components/RuleCard";
import NeonBackground from "@/components/layout/NeonBackground";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { convertRuleJsonToChessRule } from "@/lib/ruleJsonToChessRule";
import RuleGenerator, {
  type RuleGeneratorReadyPayload,
} from "@/features/rules/Generator";

type ChessRuleInsert = Database["public"]["Tables"]["chess_rules"]["Insert"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const Generator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<ChessRule | null>(null);
  const [generatedIssues, setGeneratedIssues] = useState<string[]>([]);
  const [latestCorrelationId, setLatestCorrelationId] = useState<string | null>(
    null,
  );

  const handleRuleReady = useCallback(
    async ({ result, warnings: chatWarnings }: RuleGeneratorReadyPayload) => {
      if (!user) {
        return;
      }

      if (
        result.correlationId &&
        result.correlationId === latestCorrelationId
      ) {
        return;
      }

      const normalizedRule = result.rule;
      if (!isRecord(normalizedRule)) {
        toast({
          title: "Erreur",
          description: "La règle générée est invalide (format inattendu).",
          variant: "destructive",
        });
        return;
      }

      setSaving(true);
      setGeneratedRule(null);
      setGeneratedIssues(chatWarnings);

      try {
        const sanitizedRuleJSON = JSON.parse(
          JSON.stringify(normalizedRule),
        ) as Record<string, unknown>;

        const metaRecord = isRecord(normalizedRule.meta)
          ? (normalizedRule.meta as Record<string, unknown>)
          : {};
        const scopeRecord = isRecord(normalizedRule.scope)
          ? (normalizedRule.scope as Record<string, unknown>)
          : {};

        const allowedCategories = new Set([
          "movement",
          "capture",
          "special",
          "condition",
          "victory",
          "restriction",
          "defense",
          "behavior",
          "vip",
        ]);

        const resolvedRuleId =
          typeof metaRecord.ruleId === "string" && metaRecord.ruleId.length > 0
            ? metaRecord.ruleId
            : crypto.randomUUID();
        const resolvedRuleName =
          typeof metaRecord.ruleName === "string" &&
          metaRecord.ruleName.length > 0
            ? metaRecord.ruleName
            : "Variante IA";
        const resolvedDescription =
          typeof metaRecord.description === "string"
            ? metaRecord.description
            : "";
        const rawCategory =
          typeof metaRecord.category === "string" ? metaRecord.category : "";
        const resolvedCategory = allowedCategories.has(rawCategory)
          ? rawCategory
          : "special";
        const resolvedPriority =
          typeof metaRecord.priority === "number" &&
          Number.isFinite(metaRecord.priority)
            ? metaRecord.priority
            : null;

        const tags = Array.isArray(metaRecord.tags)
          ? metaRecord.tags.filter(
              (tag): tag is string => typeof tag === "string" && tag.length > 0,
            )
          : [];
        const affectedPieces = Array.isArray(scopeRecord.affectedPieces)
          ? scopeRecord.affectedPieces.filter(
              (piece): piece is string => typeof piece === "string",
            )
          : [];

        const promptHashValue = result.promptHash ?? null;
        const aiModel = result.provider ?? null;
        const generationDuration = null;

        const sanitizedAssetsValue =
          (
            sanitizedRuleJSON as {
              assets?: ChessRuleInsert["assets"];
            }
          ).assets ?? null;

        const insertPayload: ChessRuleInsert = {
          rule_id: resolvedRuleId,
          rule_name: resolvedRuleName,
          description: resolvedDescription,
          category: resolvedCategory,
          rule_json: sanitizedRuleJSON as ChessRuleInsert["rule_json"],
          source: "ai_generated",
          status: "active",
          is_functional: true,
          created_by: user.id,
          tags,
          affected_pieces: affectedPieces,
          priority: resolvedPriority,
          assets: sanitizedAssetsValue,
          prompt: result.prompt,
          prompt_key: promptHashValue,
          ai_model: aiModel,
          generation_duration_ms: generationDuration,
        };

        const { data: upsertedRow, error: upsertError } = await supabase
          .from("chess_rules")
          .upsert(insertPayload, { onConflict: "rule_id" })
          .select("*")
          .single();

        if (upsertError || !upsertedRow) {
          throw upsertError ?? new Error("Insertion de la règle impossible.");
        }

        const dbRecord =
          upsertedRow as Database["public"]["Tables"]["chess_rules"]["Row"];
        const actualRuleJSON = isRecord(dbRecord.rule_json)
          ? (dbRecord.rule_json as Record<string, unknown>)
          : sanitizedRuleJSON;

        const persistedRuleId =
          typeof dbRecord.rule_id === "string" && dbRecord.rule_id.length > 0
            ? dbRecord.rule_id
            : resolvedRuleId;
        const persistedRuleName =
          typeof dbRecord.rule_name === "string" &&
          dbRecord.rule_name.length > 0
            ? dbRecord.rule_name
            : resolvedRuleName;
        const persistedDescription =
          typeof dbRecord.description === "string"
            ? dbRecord.description
            : resolvedDescription;
        const persistedCategory =
          typeof dbRecord.category === "string" &&
          allowedCategories.has(dbRecord.category)
            ? dbRecord.category
            : resolvedCategory;
        const persistedPriority =
          typeof dbRecord.priority === "number" &&
          Number.isFinite(dbRecord.priority)
            ? dbRecord.priority
            : (resolvedPriority ?? 1);

        const actualMeta = isRecord(actualRuleJSON.meta)
          ? (actualRuleJSON.meta as Record<string, unknown>)
          : {};
        const actualScope = isRecord(actualRuleJSON.scope)
          ? (actualRuleJSON.scope as Record<string, unknown>)
          : {};

        const displayAffectedPieces = Array.isArray(actualScope.affectedPieces)
          ? actualScope.affectedPieces.filter(
              (piece): piece is string => typeof piece === "string",
            )
          : affectedPieces;
        const displayTags = Array.isArray(actualMeta.tags)
          ? actualMeta.tags.filter(
              (tag): tag is string => typeof tag === "string" && tag.length > 0,
            )
          : tags;

        const convertedRule = convertRuleJsonToChessRule(actualRuleJSON, {
          row: {
            ...dbRecord,
            rule_id: persistedRuleId,
            rule_name: persistedRuleName,
            description: persistedDescription,
            category: persistedCategory,
            priority: persistedPriority,
            affected_pieces: displayAffectedPieces,
            tags: displayTags,
          },
          attachOriginal: true,
        });

        const displayRule: ChessRule = {
          ...convertedRule,
          id: dbRecord.id,
          ruleId: persistedRuleId,
          ruleName: persistedRuleName,
          description: persistedDescription,
          category: persistedCategory as ChessRule["category"],
          affectedPieces: displayAffectedPieces,
          tags: displayTags,
          priority: persistedPriority,
        };

        setGeneratedRule(displayRule);
        setGeneratedIssues(chatWarnings);
        setLatestCorrelationId(result.correlationId ?? null);

        toast({
          title: "Succès !",
          description: "Règle générée et ajoutée au lobby",
        });

        setTimeout(() => {
          navigate("/lobby");
        }, 2000);
      } catch (error) {
        const description = getSupabaseFunctionErrorMessage(
          error,
          "Erreur lors de la génération de la règle",
        );
        toast({ title: "Erreur", description, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [latestCorrelationId, navigate, toast, user],
  );

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
              <CardTitle className="text-3xl font-bold">
                Connexion requise
              </CardTitle>
              <CardDescription>
                Créez un compte ou connectez-vous pour générer et sauvegarder
                des règles personnalisées.
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

  return (
    <NeonBackground contentClassName="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            disabled={saving}
          >
            <ArrowLeft size={20} />
            Retour
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Générateur de Règles IA
          </h1>
          <div className="w-24" />
        </div>

        <Card className="bg-card/80 backdrop-blur-xl border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="text-primary" />
              Dialoguez avec l'IA
            </CardTitle>
            <CardDescription>
              Répondez aux questions de l'assistant pour définir précisément
              votre variante avant sauvegarde automatique.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RuleGenerator
              onRuleReady={handleRuleReady}
              disabled={saving}
              standalone={false}
            />
          </CardContent>
        </Card>

        {generatedRule && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Règle Générée</h2>
              <Badge
                variant="outline"
                className="bg-green-500/20 text-green-300 border-green-500/30 text-sm"
              >
                ✓ Règle ajoutée au lobby
              </Badge>
            </div>

            <RuleCard
              rule={generatedRule}
              showActions={false}
              issues={generatedIssues}
            />

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
