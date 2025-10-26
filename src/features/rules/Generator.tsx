// /src/features/rules/Generator.tsx
import { useMemo, useState } from "react";
import {
  invokeRuleGeneratorChat,
  type GeneratedRule,
  type RuleGeneratorChatMessage,
  type RuleGeneratorChatResult,
  type RuleGeneratorReady,
  type RuleGeneratorNeedInfoQuestion,
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
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw, CheckCircle2 } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";

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
  | {
      id: string;
      role: "assistant";
      questions: RuleGeneratorNeedInfoQuestion[];
    }
  | { id: string; role: "system"; content: string; variant?: "error" | "info" };

const buildQuestionsContent = (
  questions: RuleGeneratorNeedInfoQuestion[],
): string =>
  questions
    .map((question, index) => {
      const optionsList = question.options
        .map(
          (option, optionIndex) =>
            `${String.fromCharCode(97 + optionIndex)}) ${option}`,
        )
        .join(", ");
      const multiLabel = question.allowMultiple
        ? " (choix multiples autorisés)"
        : "";
      return `${index + 1}. ${question.question}${multiLabel}\nOptions: ${optionsList}`;
    })
    .join("\n\n");

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
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string[]>
  >({});

  const hasFinished = readyResult !== null;

  const latestQuestionMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if ("questions" in message) {
        return message;
      }
    }
    return null;
  }, [messages]);

  const hasPendingQuestions = !hasFinished && latestQuestionMessage !== null;

  const answeredQuestionCount = useMemo(() => {
    if (!latestQuestionMessage) {
      return 0;
    }

    return latestQuestionMessage.questions.reduce((count, _question, index) => {
      const key = `${latestQuestionMessage.id}-${index}`;
      const answers = selectedAnswers[key] ?? [];
      return answers.length > 0 ? count + 1 : count;
    }, 0);
  }, [latestQuestionMessage, selectedAnswers]);

  const totalQuestionCount = latestQuestionMessage?.questions.length ?? 0;

  const canSubmitQuestionAnswers = useMemo(() => {
    if (!hasPendingQuestions || !latestQuestionMessage) {
      return false;
    }

    return latestQuestionMessage.questions.every((_question, index) => {
      const key = `${latestQuestionMessage.id}-${index}`;
      return (selectedAnswers[key]?.length ?? 0) > 0;
    });
  }, [hasPendingQuestions, latestQuestionMessage, selectedAnswers]);

  const processConversation = async (
    userContent: string,
    isInitialPrompt: boolean,
  ) => {
    const userMessage: RuleGeneratorChatMessage = {
      role: "user",
      content: userContent,
    };
    const nextConversation = [...conversation, userMessage];

    setConversation(nextConversation);
    setMessages((prev) => [
      ...prev,
      { id: createMessageId(), role: "user", content: userContent },
    ]);
    setLoading(true);
    setErrorMessage(null);

    try {
      const result: RuleGeneratorChatResult = await invokeRuleGeneratorChat({
        prompt: isInitialPrompt ? userContent : undefined,
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
        setSelectedAnswers({});
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

  const sendAnswers = async () => {
    if (
      !latestQuestionMessage ||
      loading ||
      disabled ||
      hasFinished ||
      !canSubmitQuestionAnswers
    ) {
      return;
    }

    const answerSections = latestQuestionMessage.questions.map(
      (question, index) => {
        const key = `${latestQuestionMessage.id}-${index}`;
        const answers = selectedAnswers[key] ?? [];
        const formattedAnswers = answers.join(", ");
        return `${index + 1}. ${question.question}\nRéponse: ${formattedAnswers}`;
      },
    );

    const additionalNotes = inputValue.trim();
    const combinedContent =
      additionalNotes.length > 0
        ? `${answerSections.join("\n\n")}\n\nPrécisions supplémentaires: ${additionalNotes}`
        : answerSections.join("\n\n");

    setSelectedAnswers({});
    setInputValue("");
    await processConversation(combinedContent, false);
  };

  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || loading || disabled || hasFinished || hasPendingQuestions) {
      return;
    }

    setInputValue("");
    await processConversation(trimmed, conversation.length === 0);
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
    setSelectedAnswers({});
    setErrorMessage(null);
    setReadyResult(null);
    setEngineResult(null);
    setWarnings([]);
  };

  const toggleAnswer = (
    messageId: string,
    questionIndex: number,
    option: string,
    allowMultiple?: boolean,
  ) => {
    setSelectedAnswers((prev) => {
      const key = `${messageId}-${questionIndex}`;
      const next: Record<string, string[]> = { ...prev };
      const current = new Set(next[key] ?? []);

      if (allowMultiple) {
        if (current.has(option)) {
          current.delete(option);
        } else {
          current.add(option);
        }
      } else {
        if (current.has(option) && current.size === 1) {
          current.clear();
        } else {
          current.clear();
          current.add(option);
        }
      }

      if (current.size === 0) {
        delete next[key];
      } else {
        next[key] = Array.from(current);
      }

      return next;
    });
  };

  const canSend = useMemo(() => {
    if (loading || disabled || hasFinished) {
      return false;
    }

    if (hasPendingQuestions) {
      return canSubmitQuestionAnswers;
    }

    return inputValue.trim().length > 0;
  }, [
    loading,
    disabled,
    hasFinished,
    hasPendingQuestions,
    canSubmitQuestionAnswers,
    inputValue,
  ]);

  const submitLabel = hasPendingQuestions
    ? `Valider (${answeredQuestionCount}/${Math.max(totalQuestionCount, 1)})`
    : "Envoyer";

  const textareaPlaceholder = hasPendingQuestions
    ? "Ajoutez des précisions optionnelles (facultatif)..."
    : "Décrivez votre idée de règle d'échecs...";

  const chatPanel = (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-3 max-h-96 overflow-y-auto rounded-lg border p-4 bg-muted/30">
          {messages.map((message) => {
            if ("questions" in message) {
              const isLatestQuestion = latestQuestionMessage?.id === message.id;
              const canInteract = isLatestQuestion && !loading && !hasFinished;
              return (
                <div key={message.id} className="flex flex-col gap-3">
                  <div className="font-semibold text-sm text-primary">
                    Assistant
                  </div>
                  <div className="space-y-3">
                    {message.questions.map((question, index) => {
                      const questionKey = `${message.id}-${index}`;
                      const selectedForQuestion =
                        selectedAnswers[questionKey] ?? [];
                      const helperText = question.allowMultiple
                        ? "Vous pouvez sélectionner plusieurs réponses."
                        : "Sélectionnez une seule réponse.";

                      return (
                        <div
                          key={questionKey}
                          className="space-y-2 rounded-lg border bg-background/60 p-3"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium leading-snug">
                              {question.question}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {helperText}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => {
                              const optionKey = `${questionKey}-option-${optionIndex}`;
                              const isSelected =
                                selectedForQuestion.includes(option);

                              return (
                                <div
                                  key={optionKey}
                                  className={`group relative flex items-start gap-3 rounded-md border p-3 transition-all ${
                                    canInteract
                                      ? "cursor-pointer hover:border-primary hover:bg-primary/5"
                                      : "opacity-60"
                                  } ${isSelected ? "border-primary bg-primary/10" : ""}`}
                                  onClick={() => {
                                    if (canInteract) {
                                      toggleAnswer(
                                        message.id,
                                        index,
                                        option,
                                        question.allowMultiple,
                                      );
                                    }
                                  }}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    disabled={!canInteract}
                                    className="mt-0.5"
                                  />
                                  <span className="flex-1 text-sm leading-relaxed">
                                    {option}
                                  </span>
                                  {isSelected && (
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
            <div className="space-y-3">
              <ProgressBar duration={5000} />
            </div>
          )}
        </div>

        {!hasFinished && (
          <>
            <Textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={textareaPlaceholder}
              disabled={loading || disabled || hasFinished}
              rows={3}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  if (hasPendingQuestions) {
                    if (canSubmitQuestionAnswers) {
                      event.preventDefault();
                      void sendAnswers();
                    }
                  } else if (canSend) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }
              }}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (hasPendingQuestions) {
                    void sendAnswers();
                  } else {
                    void sendMessage();
                  }
                }}
                disabled={!canSend}
              >
                {submitLabel}
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
          </>
        )}
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
