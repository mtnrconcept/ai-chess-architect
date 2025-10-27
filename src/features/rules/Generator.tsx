// /src/features/rules/Generator.tsx
import { useMemo, useRef, useState } from "react";
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
import { RotateCcw, CheckCircle2, Zap, Target, Sparkles } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
      question: RuleGeneratorNeedInfoQuestion;
    }
  | { id: string; role: "system"; content: string; variant?: "error" | "info" };

const isQuestionMessage = (
  message: UiMessage,
): message is Extract<UiMessage, { question: RuleGeneratorNeedInfoQuestion }> =>
  "question" in message;

const buildQuestionContent = (
  question: RuleGeneratorNeedInfoQuestion,
): string => {
  const optionsList = question.options
    .map(
      (option, optionIndex) =>
        `${String.fromCharCode(97 + optionIndex)}) ${option}`,
    )
    .join(", ");
  return `${question.question}\nOptions: ${optionsList}`;
};

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
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string | null>
  >({});
  const isSendingAnswersRef = useRef(false);

  const hasFinished = readyResult !== null;

  const latestQuestionMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if ("question" in message) {
        return message;
      }
    }
    return null;
  }, [messages]);

  const hasPendingQuestions = !hasFinished && latestQuestionMessage !== null;

  const activeQuestionMessage =
    hasPendingQuestions &&
    latestQuestionMessage !== null &&
    isQuestionMessage(latestQuestionMessage)
      ? latestQuestionMessage
      : null;
  const isActiveQuestionMultiSelect =
    activeQuestionMessage?.question.allowMultiple === true;

  const answeredQuestionCount = useMemo(() => {
    if (!activeQuestionMessage) {
      return 0;
    }

    const key = `${activeQuestionMessage.id}-0`;
    return selectedOptions[key] ? 1 : 0;
  }, [activeQuestionMessage, selectedOptions]);

  const totalQuestionCount = latestQuestionMessage ? 1 : 0;

  const canSubmitQuestionAnswers = useMemo(() => {
    if (!hasPendingQuestions || !activeQuestionMessage) {
      return false;
    }

    const key = `${activeQuestionMessage.id}-0`;
    const answer = selectedOptions[key];
    return typeof answer === "string" && answer.length > 0;
  }, [hasPendingQuestions, activeQuestionMessage, selectedOptions]);

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
        const question = result.questions?.[0];
        if (!question) {
          throw new Error("Réponse 'need_info' invalide: question manquante.");
        }

        const formattedQuestion = buildQuestionContent(question);
        const assistantMessage: RuleGeneratorChatMessage = {
          role: "assistant",
          content: formattedQuestion,
        };

        setConversation((prevConv) => [...prevConv, assistantMessage]);
        const messageId = createMessageId();
        setMessages((prev) => [
          ...prev,
          { id: messageId, role: "assistant", question },
        ]);
        setSelectedOptions({ [`${messageId}-0`]: null });
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

  const sendAnswers = async (override?: {
    questionMessage: Extract<
      UiMessage,
      { question: RuleGeneratorNeedInfoQuestion }
    >;
    answer: string;
  }) => {
    const questionMessage = override?.questionMessage ?? activeQuestionMessage;

    if (
      !questionMessage ||
      loading ||
      disabled ||
      hasFinished ||
      (!override && !canSubmitQuestionAnswers)
    ) {
      return;
    }

    const key = `${questionMessage.id}-0`;
    const selected = override?.answer ?? selectedOptions[key];
    if (!selected || isSendingAnswersRef.current) {
      return;
    }

    isSendingAnswersRef.current = true;

    const answerSection = `${questionMessage.question.question}\nRéponse: ${selected}`;
    const additionalNotes = inputValue.trim();
    const combinedContent =
      additionalNotes.length > 0
        ? `${answerSection}\n\nPrécisions supplémentaires: ${additionalNotes}`
        : answerSection;

    setSelectedOptions({});
    setInputValue("");
    try {
      await processConversation(combinedContent, false);
    } finally {
      isSendingAnswersRef.current = false;
    }
  };

  const handleSendMessage = async () => {
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
    setSelectedOptions({});
    setErrorMessage(null);
    setReadyResult(null);
    setEngineResult(null);
    setWarnings([]);
  };

  const toggleAnswer = (
    message: Extract<UiMessage, { question: RuleGeneratorNeedInfoQuestion }>,
    option: string,
  ) => {
    if (isSendingAnswersRef.current) {
      return;
    }

    let nextSelection: string | null = null;

    setSelectedOptions((prev) => {
      const key = `${message.id}-0`;
      const current = prev[key] ?? null;
      const next: Record<string, string | null> = { ...prev };

      if (current === option) {
        next[key] = null;
        nextSelection = null;
      } else {
        next[key] = option;
        nextSelection = option;
      }

      return next;
    });

    if (
      nextSelection &&
      activeQuestionMessage?.id === message.id &&
      message.question.allowMultiple !== true
    ) {
      void sendAnswers({
        questionMessage: message,
        answer: nextSelection,
      });
    }
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
    ? isActiveQuestionMultiSelect
      ? "Sélectionnez vos réponses puis ajoutez des précisions optionnelles..."
      : "Ajoutez des précisions optionnelles avant de sélectionner une réponse (envoi automatique)..."
    : "Décrivez votre idée de règle d'échecs...";

  const canShowSubmitButton =
    !hasPendingQuestions || isActiveQuestionMultiSelect;

  const chatPanel = (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-3 max-h-96 overflow-y-auto rounded-lg border p-4 bg-muted/30">
          {messages.map((message) => {
            if ("question" in message) {
              const isLatestQuestion = latestQuestionMessage?.id === message.id;
              const canInteract = isLatestQuestion && !loading && !hasFinished;
              const questionKey = `${message.id}-0`;
              const selectedForQuestion = selectedOptions[questionKey] ?? null;

              return (
                <div key={message.id} className="flex flex-col gap-4">
                  <div className="font-semibold text-sm text-primary">
                    Assistant
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-6 rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-background/90 to-background/60 backdrop-blur-xl p-6">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-xl font-bold text-primary tracking-tight">
                          {message.question.question}
                        </h3>
                        {canInteract && (
                          <span className="text-xs text-muted-foreground">
                            Cliquez sur votre choix (envoi automatique)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {message.question.options.map((option, optionIndex) => {
                          const isSelected = selectedForQuestion === option;
                          const icons = [Zap, Target, Sparkles];
                          const Icon = icons[optionIndex % icons.length];
                          const gradients = [
                            "from-blue-500/10 to-cyan-500/10",
                            "from-orange-500/10 to-red-500/10",
                            "from-purple-500/10 to-pink-500/10"
                          ];

                          return (
                            <motion.div
                              key={`${questionKey}-option-${optionIndex}`}
                              whileHover={canInteract ? { scale: 1.03, y: -4 } : {}}
                              whileTap={canInteract ? { scale: 0.98 } : {}}
                              onClick={() => {
                                if (canInteract) {
                                  toggleAnswer(message, option);
                                }
                              }}
                              className={cn(
                                "relative cursor-pointer rounded-2xl border-2 p-6 transition-all",
                                `bg-gradient-to-br ${gradients[optionIndex % gradients.length]}`,
                                "backdrop-blur-xl shadow-lg",
                                canInteract ? "" : "opacity-60 cursor-not-allowed",
                                isSelected
                                  ? "border-primary shadow-glow scale-[1.02]"
                                  : "border-border hover:border-primary/50"
                              )}
                            >
                              {isSelected && (
                                <motion.div
                                  layoutId={`selected-${message.id}`}
                                  className="absolute inset-0 rounded-2xl border-4 border-primary/50"
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              )}

                              <div className="flex flex-col items-center gap-4 relative z-10">
                                <div
                                  className={cn(
                                    "p-4 rounded-xl transition-all",
                                    isSelected ? "bg-primary/20 scale-110" : "bg-muted/50"
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      "w-8 h-8 transition-colors",
                                      isSelected ? "text-primary" : "text-muted-foreground"
                                    )}
                                  />
                                </div>

                                <p
                                  className={cn(
                                    "text-center font-medium leading-snug transition-colors",
                                    isSelected ? "text-primary" : "text-foreground"
                                  )}
                                >
                                  {option}
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
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
                    void handleSendMessage();
                  }
                }
              }}
            />

            <div className="flex flex-wrap gap-2">
              {canShowSubmitButton && (
                <Button
                  onClick={() => {
                    if (hasPendingQuestions) {
                      void sendAnswers();
                    } else {
                      void handleSendMessage();
                    }
                  }}
                  disabled={!canSend}
                >
                  {submitLabel}
                </Button>
              )}

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
