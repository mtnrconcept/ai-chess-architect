// /src/features/rules/Generator.tsx
import { useMemo, useState } from "react";
import {
  invokeRuleGeneratorChat,
  type GeneratedRule,
  type RuleGeneratorChatMessage,
  type RuleGeneratorChatResult,
  type RuleGeneratorReady,
} from "@/lib/supabase/functions";
import {
  transformAiRuleToEngineRule,
  validateRuleJSONActions,
} from "@/lib/aiRuleTransformer";
import type { RuleJSON } from "@/engine/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RotateCcw } from "lucide-react";

const toErrorMessage = (value: unknown): string => {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "Unknown error";
  }
};

type UiMessage =
  | { id: string; role: "assistant" | "user"; content: string }
  | { id: string; role: "assistant"; questions: string[] }
  | { id: string; role: "system"; content: string; variant?: "error" | "info" };

const buildQuestionsContent = (questions: string[]): string =>
  questions.map((question, index) => `${index + 1}. ${question}`).join("\n");

const buildAssistantSummary = (result: RuleGeneratorReady): string => {
  const rawMeta =
    result && typeof result.rule === "object" && result.rule !== null
      ? ((result.rule as GeneratedRule).meta as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const ruleName =
    rawMeta && typeof rawMeta.ruleName === "string"
      ? rawMeta.ruleName
      : undefined;

  if (ruleName && ruleName.length > 0) {
    return `Règle "${ruleName}" générée. Voici le détail complet.`;
  }
  return "Règle générée. Voici le détail complet.";
};

const createMessageId = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return `msg-${Date.now()}-${counter}`;
  };
})();

export type RuleGeneratorReadyPayload = {
  result: RuleGeneratorReady;
  engineRule: RuleJSON;
  warnings: string[];
  conversation: RuleGeneratorChatMessage[];
};

type RuleGeneratorProps = {
  onRuleReady?: (payload: RuleGeneratorReadyPayload) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  standalone?: boolean;
};

export default function RuleGenerator({
  onRuleReady,
  disabled = false,
  className,
  standalone = true,
}: RuleGeneratorProps) {
  const [conversation, setConversation] = useState<RuleGeneratorChatMessage[]>(
    [],
  );
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: createMessageId(),
      role: "assistant",
      content:
        "Décrivez votre idée de règle d'échecs. Je poserai des questions complémentaires avant de proposer la règle finale.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readyResult, setReadyResult] = useState<RuleGeneratorReady | null>(
    null,
  );
  const [engineResult, setEngineResult] = useState<RuleJSON | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const hasFinished = readyResult !== null;

  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || loading || disabled) {
      return;
    }

    const userMessage: RuleGeneratorChatMessage = {
      role: "user",
      content: trimmed,
    };
    const nextConversation = [...conversation, userMessage];

    setConversation(nextConversation);
    setMessages((prev) => [
      ...prev,
      { id: createMessageId(), role: "user", content: trimmed },
    ]);
    setInputValue("");
    setLoading(true);
    setErrorMessage(null);

    try {
      const result: RuleGeneratorChatResult = await invokeRuleGeneratorChat({
        prompt: conversation.length === 0 ? trimmed : undefined,
        conversation: nextConversation,
        options: { locale: "fr-CH", dryRun: false },
      });

      if (result.status === "need_info") {
        const questions = result.questions ?? [];
        const formattedQuestions = buildQuestionsContent(questions);
        const assistantMessage: RuleGeneratorChatMessage = {
          role: "assistant",
          content: formattedQuestions,
        };

        setConversation((prevConv) => [...prevConv, assistantMessage]);
        setMessages((prev) => [
          ...prev,
          { id: createMessageId(), role: "assistant", questions },
        ]);
      } else {
        setReadyResult(result);
        const summary = buildAssistantSummary(result);
        const assistantMessage: RuleGeneratorChatMessage = {
          role: "assistant",
          content: summary,
        };
        const finalConversation = [...nextConversation, assistantMessage];

        setConversation(finalConversation);
        setMessages((prev) => [
          ...prev,
          { id: createMessageId(), role: "assistant", content: summary },
        ]);

        try {
          const engineRule = transformAiRuleToEngineRule(
            result.rule as GeneratedRule,
          );
          setEngineResult(engineRule);

          const unknownActions = validateRuleJSONActions(engineRule);
          const computedWarnings =
            unknownActions.length > 0
              ? [`Actions inconnues détectées : ${unknownActions.join(", ")}`]
              : [];
          setWarnings(computedWarnings);

          Promise.resolve(
            onRuleReady?.({
              result,
              engineRule,
              warnings: computedWarnings,
              conversation: finalConversation,
            }),
          ).catch((callbackError) => {
            const message = toErrorMessage(callbackError);
            setMessages((prev) => [
              ...prev,
              {
                id: createMessageId(),
                role: "system",
                content: message,
                variant: "error",
              },
            ]);
          });
        } catch (transformError) {
          const message = toErrorMessage(transformError);
          setErrorMessage(message);
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "system",
              content: message,
              variant: "error",
            },
          ]);
        }
      }
    } catch (error) {
      const message = toErrorMessage(error);
      setErrorMessage(message);
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "system",
          content: message,
          variant: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = () => {
    setConversation([]);
    setMessages([
      {
        id: createMessageId(),
        role: "assistant",
        content:
          "Décrivez votre idée de règle d'échecs. Je poserai des questions complémentaires avant de proposer la règle finale.",
      },
    ]);
    setInputValue("");
    setErrorMessage(null);
    setReadyResult(null);
    setEngineResult(null);
    setWarnings([]);
  };

  const canSend = useMemo(
    () => inputValue.trim().length > 0 && !loading && !disabled && !hasFinished,
    [inputValue, loading, disabled, hasFinished],
  );

  const chatPanel = (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-3 max-h-96 overflow-y-auto rounded-lg border p-4 bg-muted/30">
          {messages.map((message) => {
            if ("questions" in message) {
              return (
                <div key={message.id} className="flex flex-col gap-1">
                  <div className="font-semibold text-sm text-primary">
                    Assistant
                  </div>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">
                    {message.questions.map((question, index) => (
                      <li key={`${message.id}-${index}`}>{question}</li>
                    ))}
                  </ul>
                </div>
              );
            }

            if (message.role === "system") {
              const colorClasses =
                message.variant === "error"
                  ? "text-destructive"
                  : "text-muted-foreground";
              return (
                <div key={message.id} className={`text-sm ${colorClasses}`}>
                  {message.content}
                </div>
              );
            }

            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  isUser
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-background border"
                }`}
              >
                <span className="block text-xs font-semibold mb-1">
                  {isUser ? "Vous" : "Assistant"}
                </span>
                <span className="whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </span>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Réflexion en cours…</span>
            </div>
          )}
        </div>

        <Textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={
            hasFinished
              ? "La session est terminée. Réinitialisez pour recommencer."
              : "Expliquez la règle ou répondez aux questions de l'assistant"
          }
          disabled={loading || disabled || hasFinished}
          rows={3}
        />

        <div className="flex flex-wrap gap-2">
          <Button onClick={sendMessage} disabled={!canSend}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Envoi…
              </>
            ) : (
              "Envoyer"
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={resetConversation}
            disabled={loading}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Réinitialiser
          </Button>
        </div>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert>
          <AlertDescription>
            {warnings.map((warning, index) => (
              <div key={`${warning}-${index}`}>{warning}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {readyResult && engineResult && (
        <Tabs defaultValue="engine" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="engine">Format Moteur</TabsTrigger>
            <TabsTrigger value="ai">Format IA (brut)</TabsTrigger>
          </TabsList>

          <TabsContent value="engine" className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Format compatible avec le moteur de règles
            </p>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
              {JSON.stringify(engineResult, null, 2)}
            </pre>
          </TabsContent>

          <TabsContent value="ai" className="space-y-2">
            <p className="text-sm text-muted-foreground">
              JSON brut généré par l'IA
            </p>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
              {JSON.stringify(readyResult.rule, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );

  if (!standalone) {
    return <div className={className}>{chatPanel}</div>;
  }

  const containerClassName = className ?? "container mx-auto p-6 space-y-6";

  return (
    <div className={containerClassName}>
      <Card>
        <CardHeader>
          <CardTitle>Générateur de règle IA</CardTitle>
        </CardHeader>
        <CardContent>{chatPanel}</CardContent>
      </Card>
    </div>
  );
}
