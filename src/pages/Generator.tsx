import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { analyzeRuleLogic } from "@/lib/ruleValidation";
import type { Database } from "@/integrations/supabase/types";
import { convertRuleJsonToChessRule } from "@/lib/ruleJsonToChessRule";
import { invokeGenerateRule } from "@/lib/supabase/functions";

const PROMPT_MIN = 10;
const PROMPT_MAX = 800;
const INVOKE_TIMEOUT_MS = 15000; // 15s pour ne pas bloquer l’UI
const MAX_RETRIES = 2;

type InvokeResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: Error; status?: number; details?: string[] };

type SupabaseInvokeErrorResponse = {
  status?: number;
  json?: () => Promise<unknown>;
};

type SupabaseInvokeErrorContext = {
  response?: SupabaseInvokeErrorResponse;
};

type SupabaseInvokeError = Error & {
  context?: SupabaseInvokeErrorContext;
  status?: number;
  name?: string;
};

const extractErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeError = error as Partial<SupabaseInvokeError>;
  return maybeError.context?.response?.status ?? maybeError.status;
};

const extractErrorName = (error: unknown): string => {
  if (!error || typeof error !== "object") {
    return "";
  }

  const maybeError = error as Partial<SupabaseInvokeError>;
  const fromName = maybeError.name;
  if (typeof fromName === "string" && fromName.length > 0) {
    return fromName;
  }

  if (
    "constructor" in maybeError &&
    typeof maybeError.constructor === "function"
  ) {
    return maybeError.constructor.name ?? "";
  }

  return "";
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }

  return "";
};

const extractErrorResponseJson = (
  error: unknown,
): (() => Promise<unknown>) | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeError = error as Partial<SupabaseInvokeError>;
  const response = maybeError.context?.response;
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const jsonMethod = (response as { json?: unknown }).json;
  if (typeof jsonMethod === "function") {
    return jsonMethod.bind(response);
  }

  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const serializeUnknown = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return "Unknown error";
  }
};

const isRetriable = (status?: number, err?: unknown) => {
  if (!status) {
    // Erreurs réseau typiques (Edge down, CORS, socket close…)
    const name = extractErrorName(err);
    return name.includes("TypeError") || name.includes("FunctionsFetchError");
  }
  // 502 (gateway), 429 (ratelimit), 503 (provider indispo) -> retry
  return status === 502 || status === 429 || status === 503;
};

async function invokeWithTimeoutAndRetry(
  fn: string,
  body: Record<string, unknown>,
  signalExternal?: AbortSignal,
): Promise<InvokeResult> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort("timeout"),
      INVOKE_TIMEOUT_MS,
    );

    // Chaîne les signaux si un AbortController externe est passé
    const onAbort = () => controller.abort("external-abort");
    signalExternal?.addEventListener("abort", onAbort, { once: true });

    try {
      const sanitizedBody = JSON.parse(JSON.stringify(body));
      console.log(
        "[invokeWithTimeoutAndRetry] Sanitized body:",
        sanitizedBody,
        "Original body:",
        body,
      );

      const { data, error } = await supabase.functions.invoke(fn, {
        body: sanitizedBody,
        signal: controller.signal,
      });

      clearTimeout(timer);
      signalExternal?.removeEventListener("abort", onAbort);

      if (error) {
        // `error` de supabase.functions.invoke peut contenir status
        const status = extractErrorStatus(error);
        // payload data?.error éventuel traité par l’appelant
        if (isRetriable(status, error) && attempt < MAX_RETRIES) {
          attempt++;
          await new Promise((res) =>
            setTimeout(res, Math.pow(2, attempt) * 300),
          );
          continue;
        }
        // Certaines erreurs 4xx (ex: 422) renvoient un JSON exploitable dans error.context.response
        // On essaye de l'extraire pour afficher un message clair à l'utilisateur.
        const readJson = extractErrorResponseJson(error);
        if (readJson) {
          try {
            const parsed = await readJson();
            if (parsed && typeof parsed === "object") {
              const {
                error: fnError,
                reason,
                details,
              } = parsed as {
                error?: unknown;
                reason?: unknown;
                details?: unknown;
              };

              const errorMessage =
                typeof fnError === "string" ? fnError : undefined;
              if (errorMessage) {
                const reasonMessage =
                  typeof reason === "string" ? reason : undefined;

                const detailsMessage = Array.isArray(details)
                  ? details
                      .map((detail) => {
                        if (typeof detail === "string") {
                          return detail;
                        }
                        if (detail && typeof detail === "object") {
                          const detailObject = detail as {
                            message?: unknown;
                            path?: unknown;
                          };
                          const path =
                            typeof detailObject.path === "string"
                              ? detailObject.path
                              : undefined;
                          const message =
                            typeof detailObject.message === "string"
                              ? detailObject.message
                              : undefined;
                          return [path, message].filter(Boolean).join(": ");
                        }
                        return undefined;
                      })
                      .filter(
                        (entry): entry is string =>
                          typeof entry === "string" && entry.length > 0,
                      )
                      .join(" — ")
                  : typeof details === "string"
                    ? details
                    : undefined;

                const combined = [errorMessage, reasonMessage, detailsMessage]
                  .filter(
                    (part): part is string =>
                      typeof part === "string" && part.length > 0,
                  )
                  .join(" — ");

                if (combined.length > 0) {
                  const enrichedError = new Error(combined);
                  return { ok: false, error: enrichedError, status };
                }
              }
            }
          } catch (_jsonParseError) {
            // Ignore parsing errors, fallback to original error.
          }
        }

        return { ok: false, error, status };
      }

      return { ok: true, payload: data };
    } catch (err: unknown) {
      clearTimeout(timer);
      signalExternal?.removeEventListener("abort", onAbort);

      const status = extractErrorStatus(err);
      const normalizedError =
        err instanceof Error
          ? err
          : new Error(extractErrorMessage(err) || "Unknown error");
      lastError = normalizedError;

      console.error(
        `[invokeWithTimeoutAndRetry] Attempt ${attempt + 1} failed:`,
        {
          name: extractErrorName(err),
          message: extractErrorMessage(err),
          status,
          isRetriable: isRetriable(status, err),
        },
      );

      if (isRetriable(status, err) && attempt < MAX_RETRIES) {
        attempt++;
        await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 300));
        continue;
      }
      return { ok: false, error: normalizedError, status };
    }
  }

  return { ok: false, error: lastError ?? new Error("Unknown failure") };
}

const Generator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedRule, setGeneratedRule] = useState<ChessRule | null>(null);
  const [generatedIssues, setGeneratedIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const promptTooShort = useMemo(
    () => prompt.trim().length > 0 && prompt.trim().length < PROMPT_MIN,
    [prompt],
  );
  const promptTooLong = useMemo(
    () => prompt.trim().length > PROMPT_MAX,
    [prompt],
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

  const generateRule = async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer une description de règle",
        variant: "destructive",
      });
      return;
    }
    if (trimmed.length < PROMPT_MIN || trimmed.length > PROMPT_MAX) {
      toast({
        title: "Validation",
        description: `Le prompt doit contenir entre ${PROMPT_MIN} et ${PROMPT_MAX} caractères.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setGeneratedIssues([]);
    setGeneratedRule(null);

    try {
      const ruleEnvelope = await invokeGenerateRule({
        prompt: trimmed,
        options: { locale: "fr-CH", dryRun: false },
      });

      let rawRule: unknown = ruleEnvelope;

      if (typeof rawRule === "string") {
        try {
          rawRule = JSON.parse(rawRule);
        } catch (parseError) {
          console.warn(
            "[generator] Règle renvoyée STRING non parsable.",
            parseError,
          );
          throw new Error("La règle générée est invalide (JSON non parsable).");
        }
      }

      if (!isRecord(rawRule)) {
        throw new Error("La règle générée est invalide (format inattendu).");
      }

      const normalizedRule = rawRule;
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
          ? (metaRecord.ruleId as string)
          : crypto.randomUUID();
      const resolvedRuleName =
        typeof metaRecord.ruleName === "string" &&
        metaRecord.ruleName.length > 0
          ? (metaRecord.ruleName as string)
          : "Variante IA";
      const resolvedDescription =
        typeof metaRecord.description === "string"
          ? (metaRecord.description as string)
          : "";
      const rawCategory =
        typeof metaRecord.category === "string"
          ? (metaRecord.category as string)
          : "";
      const resolvedCategory = allowedCategories.has(rawCategory)
        ? rawCategory
        : "special";
      const resolvedPriority =
        typeof metaRecord.priority === "number" &&
        Number.isFinite(metaRecord.priority)
          ? (metaRecord.priority as number)
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

      const promptHashValue = null;
      const rawModelResponse = undefined;
      const aiModel = null;
      const generationDuration = null;

      const sanitizedAssetsValue =
        (
          sanitizedRuleJSON as {
            assets?: Database["public"]["Tables"]["chess_rules"]["Insert"]["assets"];
          }
        ).assets ?? null;

      const insertPayload: Database["public"]["Tables"]["chess_rules"]["Insert"] =
        {
          rule_id: resolvedRuleId,
          rule_name: resolvedRuleName,
          description: resolvedDescription,
          category: resolvedCategory,
          rule_json:
            sanitizedRuleJSON as Database["public"]["Tables"]["chess_rules"]["Insert"]["rule_json"],
          source: "ai_generated",
          status: "active",
          is_functional: true,
          created_by: user.id,
          tags,
          affected_pieces: affectedPieces,
          priority: resolvedPriority,
          assets: sanitizedAssetsValue,
          prompt: trimmed,
          prompt_key: promptHashValue,
          ai_model: aiModel,
          generation_duration_ms: generationDuration,
        };

      setSaving(true);

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
        typeof dbRecord.rule_name === "string" && dbRecord.rule_name.length > 0
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
      setGeneratedIssues([]);

      console.log("[Generator] Rule generated and persisted:", dbRecord.id);

      toast({
        title: "Succès !",
        description: "Règle générée et ajoutée au lobby",
      });

      // Redirection vers le lobby après 2s
      setTimeout(() => {
        navigate("/lobby");
      }, 2000);
    } catch (error: unknown) {
      console.error("Error generating rule:", error);
      const description = getSupabaseFunctionErrorMessage(
        error,
        "Erreur lors de la génération de la règle",
      );
      toast({ title: "Erreur", description, variant: "destructive" });
    } finally {
      setSaving(false);
      setLoading(false);
    }
  };

  // La sauvegarde est effectuée automatiquement lors de la génération via Supabase.

  return (
    <NeonBackground contentClassName="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            disabled={loading || saving}
          >
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
              Laissez l&apos;IA créer une règle d&apos;échecs unique basée sur
              votre description
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
              disabled={
                loading ||
                saving ||
                !prompt.trim() ||
                promptTooShort ||
                promptTooLong
              }
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
