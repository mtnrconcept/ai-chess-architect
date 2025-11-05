// /src/features/rules/Generator.tsx
import { useCallback, useMemo, useRef, useState } from "react";
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
import {
  RotateCcw,
  CheckCircle2,
  Zap,
  Target,
  Sparkles,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// Questions guidées pour orienter la génération
const GUIDED_QUESTIONS = [
  {
    id: "piece_type",
    question: "Quelle pièce voulez-vous modifier ?",
    choices: [
      { label: "Pions", value: "pawn", icon: "♟️" },
      { label: "Tours", value: "rook", icon: "♜" },
      { label: "Cavaliers", value: "knight", icon: "♞" },
    ],
  },
  {
    id: "rule_category",
    question: "Quel type de modification ?",
    choices: [
      { label: "Déplacement spécial", value: "movement", icon: "🏃" },
      { label: "Attaque à distance", value: "attack", icon: "🎯" },
      { label: "Défense/Protection", value: "defense", icon: "🛡️" },
    ],
  },
  {
    id: "power_level",
    question: "Quelle puissance pour cette règle ?",
    choices: [
      { label: "Légère (usage fréquent)", value: "light", icon: "⚡" },
      { label: "Moyenne (équilibrée)", value: "medium", icon: "💫" },
      { label: "Forte (cooldown long)", value: "strong", icon: "🔥" },
    ],
  },
];

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toOptionalString(entry))
    .filter((entry): entry is string => typeof entry === "string");
};

const stringifyStructuredValue = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => stringifyStructuredValue(entry))
      .filter((entry): entry is string => typeof entry === "string");
    return parts.length > 0 ? parts.join(", ") : undefined;
  }

  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const formatInlineList = (values: string[]): string => {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  return values.join(", ");
};

const formatBulletList = (values: string[]): string =>
  values.map((value) => `• ${value}`).join("\n");

const collectActionLabels = (value: unknown): string[] => {
  const labels: string[] = [];

  const register = (entry: unknown) => {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        labels.push(trimmed);
      }
      return;
    }

    if (isRecord(entry)) {
      const label =
        toOptionalString(entry["action"]) ??
        toOptionalString(entry["type"]) ??
        toOptionalString(entry["id"]) ??
        toOptionalString(entry["name"]);

      if (label) {
        labels.push(label);
      }
    }
  };

  if (Array.isArray(value)) {
    value.forEach(register);
  } else if (value !== undefined) {
    register(value);
  }

  return labels;
};

const buildRuleDetailsMessage = (rule: GeneratedRule): string | null => {
  if (!isRecord(rule)) {
    return null;
  }

  const meta = isRecord(rule.meta) ? rule.meta : {};
  const scope = isRecord(rule.scope) ? rule.scope : {};
  const ui = isRecord(rule.ui) ? rule.ui : {};
  const logic = isRecord(rule.logic) ? rule.logic : {};

  const description =
    toOptionalString(meta.description) ?? toOptionalString(rule.description);
  const category =
    toOptionalString(meta.category) ?? toOptionalString(rule.category);
  const affectedPieces = toStringArray(
    scope.affectedPieces ?? rule.affected_pieces ?? rule.affectedPieces,
  );
  const tags = toStringArray(meta.tags ?? rule.tags);

  const uiActions = Array.isArray(ui.actions)
    ? ui.actions
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }

          const label =
            toOptionalString(entry["label"]) ??
            toOptionalString(entry["name"]) ??
            toOptionalString(entry["id"]) ??
            toOptionalString(entry["action"]);

          if (!label) {
            return null;
          }

          const detailParts: string[] = [];
          const hint = toOptionalString(entry["hint"]);
          if (hint) {
            detailParts.push(hint);
          }

          const availabilityValue = entry["availability"];
          const availability = isRecord(availabilityValue)
            ? availabilityValue
            : undefined;

          if (availability) {
            const pieceTypes = toStringArray(availability["pieceTypes"]);
            if (pieceTypes.length > 0) {
              detailParts.push(`Pour ${formatInlineList(pieceTypes)}`);
            }

            const phase = toOptionalString(availability["phase"]);
            if (phase) {
              detailParts.push(`Phase : ${phase}`);
            }
          }

          if (entry["consumesTurn"] === true) {
            detailParts.push("Consomme le tour");
          }

          const cooldownValue = entry["cooldown"];
          const cooldown = isRecord(cooldownValue) ? cooldownValue : undefined;
          if (cooldown) {
            const cooldownParts: string[] = [];
            if (typeof cooldown["perPiece"] === "number") {
              cooldownParts.push(`${cooldown["perPiece"]} tour(s) par pièce`);
            }
            if (typeof cooldown["global"] === "number") {
              cooldownParts.push(`${cooldown["global"]} tour(s) globaux`);
            }
            if (cooldownParts.length > 0) {
              detailParts.push(`Recharge : ${cooldownParts.join(" / ")}`);
            }
          }

          if (typeof entry["maxPerPiece"] === "number") {
            detailParts.push(
              `Limité à ${entry["maxPerPiece"]} utilisation(s) par pièce`,
            );
          }

          const targetingValue = entry["targeting"];
          const targeting = isRecord(targetingValue)
            ? targetingValue
            : undefined;
          if (targeting) {
            const mode = toOptionalString(targeting["mode"]);
            if (mode) {
              detailParts.push(`Ciblage : ${mode}`);
            }
          }

          return detailParts.length > 0
            ? `${label} — ${detailParts.join(" · ")}`
            : label;
        })
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        )
    : [];

  const logicGuards = Array.isArray(logic.guards)
    ? logic.guards
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }

          const label =
            toOptionalString(entry["id"]) ??
            toOptionalString(entry["name"]) ??
            toOptionalString(entry["run"]);

          const parts: string[] = [];
          const message = toOptionalString(entry["message"]);
          if (message) {
            parts.push(message);
          }

          const condition = stringifyStructuredValue(
            entry["if"] ?? entry["condition"] ?? entry["conditions"],
          );
          if (condition) {
            parts.push(`Condition : ${condition}`);
          }

          const onFail = toOptionalString(entry["onFail"]);
          if (onFail) {
            parts.push(`En cas d'échec : ${onFail}`);
          }

          if (!label && parts.length === 0) {
            return null;
          }

          return parts.length > 0
            ? `${label ?? "Garde"} — ${parts.join(" · ")}`
            : label;
        })
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        )
    : [];

  const effectsValue = logic.effects;
  const logicEffects = Array.isArray(effectsValue)
    ? effectsValue
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }

          const label =
            toOptionalString(entry["id"]) ?? toOptionalString(entry["name"]);

          const when =
            toOptionalString(entry["when"]) ??
            toOptionalString(entry["trigger"]) ??
            toOptionalString(entry["phase"]) ??
            "Déclencheur inconnu";

          const condition = stringifyStructuredValue(
            entry["if"] ?? entry["condition"] ?? entry["conditions"],
          );

          const actionLabels = [
            ...collectActionLabels(entry["do"]),
            ...collectActionLabels(entry["actions"]),
            ...collectActionLabels(entry["action"]),
            ...collectActionLabels(entry["then"]),
          ];

          const uniqueActions = Array.from(new Set(actionLabels));
          const parts: string[] = [`Déclencheur : ${when}`];

          if (uniqueActions.length > 0) {
            parts.push(`Actions : ${formatInlineList(uniqueActions)}`);
          }

          if (condition) {
            parts.push(`Condition : ${condition}`);
          }

          const message = toOptionalString(entry["message"]);
          if (message) {
            parts.push(`Message : ${message}`);
          }

          if (parts.length === 0) {
            return null;
          }

          return label ? `${label} — ${parts.join(" · ")}` : parts.join(" · ");
        })
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        )
    : [];

  const sections: string[] = [];

  if (description) {
    sections.push(`Description : ${description}`);
  }

  if (category) {
    sections.push(`Catégorie : ${category}`);
  }

  if (affectedPieces.length > 0) {
    sections.push(`Pièces concernées : ${formatInlineList(affectedPieces)}`);
  }

  if (tags.length > 0) {
    sections.push(`Tags : ${formatInlineList(tags)}`);
  }

  if (uiActions.length > 0) {
    sections.push(`Actions spéciales :\n${formatBulletList(uiActions)}`);
  }

  if (logicGuards.length > 0) {
    sections.push(`Gardes :\n${formatBulletList(logicGuards)}`);
  }

  if (logicEffects.length > 0) {
    sections.push(`Effets principaux :\n${formatBulletList(logicEffects)}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
};

type AssistantUiMessage = {
  id: string;
  role: "assistant";
  content: string;
  rule?: GeneratedRule;
};

type UserUiMessage = { id: string; role: "user"; content: string };

type QuestionUiMessage = {
  id: string;
  role: "assistant";
  question: RuleGeneratorNeedInfoQuestion;
};

type SystemUiMessage = {
  id: string;
  role: "system";
  content: string;
  variant?: "error" | "info";
};

type UiMessage =
  | AssistantUiMessage
  | UserUiMessage
  | QuestionUiMessage
  | SystemUiMessage;

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

type PublishState = "idle" | "loading" | "success";

const resolvePublishRuleName = (rule: GeneratedRule): string => {
  const ruleRecord = rule as Record<string, unknown>;
  const meta = isRecord(ruleRecord.meta)
    ? (ruleRecord.meta as Record<string, unknown>)
    : undefined;

  return (
    toOptionalString(meta?.ruleName) ??
    toOptionalString(meta?.name) ??
    toOptionalString(ruleRecord.ruleName) ??
    toOptionalString(ruleRecord.name) ??
    "Variante IA"
  );
};

const resolvePublishRuleDescription = (
  rule: GeneratedRule,
): string | undefined => {
  const ruleRecord = rule as Record<string, unknown>;
  const meta = isRecord(ruleRecord.meta)
    ? (ruleRecord.meta as Record<string, unknown>)
    : undefined;

  return (
    toOptionalString(meta?.description) ??
    toOptionalString(ruleRecord.description) ??
    undefined
  );
};

const sanitiseRuleMetadata = (rule: GeneratedRule): Record<string, unknown> => {
  try {
    return JSON.parse(JSON.stringify(rule)) as Record<string, unknown>;
  } catch (_error) {
    return { ...(rule as Record<string, unknown>) };
  }
};

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
  const { toast } = useToast();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<RuleGeneratorChatMessage[]>(
    [],
  );
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: createMessageId(),
      role: "assistant",
      content:
        "Répondez aux questions ci-dessous pour créer votre règle personnalisée.",
    },
  ]);
  const [publishStatus, setPublishStatus] = useState<
    Record<string, PublishState>
  >({});
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readyResult, setReadyResult] = useState<RuleGeneratorReady | null>(
    null,
  );
  const [engineResult, setEngineResult] = useState<RuleJSON | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string[]>
  >({});
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({});
  const [currentGuidedStep, setCurrentGuidedStep] = useState(0);
  const [guidedMode, setGuidedMode] = useState(true);
  const isSendingAnswersRef = useRef(false);

  const hasFinished = readyResult !== null;

  const handlePublishRule = useCallback(
    async (messageId: string, rule: GeneratedRule) => {
      if (!user) {
        toast({
          title: "Connexion requise",
          description: "Connectez-vous pour publier cette règle dans le lobby.",
          variant: "destructive",
        });
        return;
      }

      if (!supabase) {
        toast({
          title: "Supabase non configuré",
          description:
            "Impossible de publier la règle car la connexion Supabase est indisponible.",
          variant: "destructive",
        });
        return;
      }

      const ruleName = resolvePublishRuleName(rule);
      const description = resolvePublishRuleDescription(rule);

      let shouldAbort = false;
      setPublishStatus((prev) => {
        const current = prev[messageId];
        if (current === "loading" || current === "success") {
          shouldAbort = true;
          return prev;
        }
        return { ...prev, [messageId]: "loading" };
      });

      if (shouldAbort) {
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke<{
          id: string;
          rule_id: string;
          rule_name: string;
        }>("publish-custom-rule", {
          body: {
            rule_name: ruleName,
            description: description ?? null,
            rule_json: sanitiseRuleMetadata(rule),
          },
        });

        if (error) {
          throw error;
        }

        setPublishStatus((prev) => ({ ...prev, [messageId]: "success" }));

        toast({
          title: "Règle publiée",
          description: `« ${data?.rule_name ?? ruleName} » est désormais disponible dans le lobby.`,
        });
      } catch (error) {
        setPublishStatus((prev) => ({ ...prev, [messageId]: "idle" }));
        toast({
          title: "Publication impossible",
          description: toErrorMessage(error),
          variant: "destructive",
        });
      }
    },
    [toast, user],
  );

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
    const answers = selectedOptions[key] ?? [];
    return answers.length;
  }, [activeQuestionMessage, selectedOptions]);

  const totalQuestionCount = latestQuestionMessage ? 1 : 0;

  const canSubmitQuestionAnswers = useMemo(() => {
    if (!hasPendingQuestions || !activeQuestionMessage) {
      return false;
    }

    const key = `${activeQuestionMessage.id}-0`;
    const answers = selectedOptions[key] ?? [];
    return answers.length > 0;
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
        setSelectedOptions({ [`${messageId}-0`]: [] });
      } else {
        setReadyResult(result);
        const summary = buildAssistantSummary(result);
        const assistantMessage: RuleGeneratorChatMessage = {
          role: "assistant",
          content: summary,
        };
        const generatedRule = result.rule as GeneratedRule;
        const details = buildRuleDetailsMessage(generatedRule);
        const detailMessage: RuleGeneratorChatMessage | null = details
          ? { role: "assistant", content: details }
          : null;
        const finalConversation = detailMessage
          ? [...nextConversation, assistantMessage, detailMessage]
          : [...nextConversation, assistantMessage];

        setConversation(finalConversation);
        const summaryMessageId = createMessageId();
        const summaryUiMessage: AssistantUiMessage = {
          id: summaryMessageId,
          role: "assistant",
          content: summary,
          rule: generatedRule,
        };
        const detailUiMessage: AssistantUiMessage | null = details
          ? {
              id: createMessageId(),
              role: "assistant" as const,
              content: details,
            }
          : null;

        setMessages((prev) => [
          ...prev,
          summaryUiMessage,
          ...(detailUiMessage ? [detailUiMessage] : []),
        ]);
        setPublishStatus((prev) => {
          if (prev[summaryMessageId]) {
            return prev;
          }
          return { ...prev, [summaryMessageId]: "idle" };
        });

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
    answer: string[];
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
    const selected = override?.answer ?? selectedOptions[key] ?? [];
    if (selected.length === 0 || isSendingAnswersRef.current) {
      return;
    }

    isSendingAnswersRef.current = true;

    const answerLabel = selected.length > 1 ? "Réponses" : "Réponse";
    const formattedAnswers = selected.join(", ");
    const answerSection = `${questionMessage.question.question}\n${answerLabel}: ${formattedAnswers}`;
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
    setPublishStatus({});
  };

  const toggleAnswer = (
    message: Extract<UiMessage, { question: RuleGeneratorNeedInfoQuestion }>,
    option: string,
  ) => {
    if (isSendingAnswersRef.current) {
      return;
    }

    const isActive = activeQuestionMessage?.id === message.id;
    let nextSelection: string[] = [];

    setSelectedOptions((prev) => {
      const key = `${message.id}-0`;
      const current = prev[key] ?? [];

      if (message.question.allowMultiple) {
        const updated = [...current];
        const optionIndex = updated.indexOf(option);
        if (optionIndex >= 0) {
          updated.splice(optionIndex, 1);
        } else {
          updated.push(option);
        }
        nextSelection = updated;
        return { ...prev, [key]: updated };
      }

      if (current.length === 1 && current[0] === option) {
        nextSelection = [];
        return { ...prev, [key]: [] };
      }

      nextSelection = [option];
      return { ...prev, [key]: nextSelection };
    });

    if (
      !message.question.allowMultiple &&
      isActive &&
      nextSelection.length > 0
    ) {
      void sendAnswers({
        questionMessage: message,
        answer: nextSelection,
      });
    }
  };

  const handleGuidedChoice = useCallback((questionId: string, value: string) => {
    setGuidedAnswers(prev => ({ ...prev, [questionId]: value }));
    
    if (currentGuidedStep < GUIDED_QUESTIONS.length - 1) {
      setCurrentGuidedStep(prev => prev + 1);
    } else {
      // Toutes les questions guidées sont répondues, construire le prompt
      const allAnswers = { ...guidedAnswers, [questionId]: value };
      
      const pieceMap: Record<string, string> = {
        pawn: "pions",
        rook: "tours",
        knight: "cavaliers",
      };
      
      const categoryMap: Record<string, string> = {
        movement: "déplacement spécial",
        attack: "attaque à distance",
        defense: "défense et protection",
      };
      
      const powerMap: Record<string, string> = {
        light: "léger (usage fréquent, cooldown de 1 tour)",
        medium: "équilibré (usage modéré, cooldown de 2-3 tours)",
        strong: "puissant (usage rare, cooldown de 4-5 tours)",
      };
      
      const piece = pieceMap[allAnswers.piece_type] || "pions";
      const category = categoryMap[allAnswers.rule_category] || "spécial";
      const power = powerMap[allAnswers.power_level] || "équilibré";
      
      const prompt = `Crée une règle personnalisée pour les ${piece} avec une capacité de type "${category}" et un niveau de puissance ${power}. La règle doit être complète, équilibrée et amusante à jouer.`;
      
      setGuidedMode(false);
      setInputValue(prompt);
      
      // Auto-submit après un court délai pour que l'utilisateur voie le prompt
      setTimeout(() => {
        processConversation(prompt, true);
      }, 500);
    }
  }, [currentGuidedStep, guidedAnswers, processConversation]);

  const resetGuided = useCallback(() => {
    setGuidedAnswers({});
    setCurrentGuidedStep(0);
    setGuidedMode(true);
    resetConversation();
  }, []);

  const canSend = useMemo(() => {
    if (loading || disabled || hasFinished || guidedMode) {
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
    guidedMode,
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
          {guidedMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <HelpCircle className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-primary">
                  Configuration guidée ({currentGuidedStep + 1}/{GUIDED_QUESTIONS.length})
                </h3>
              </div>

              {GUIDED_QUESTIONS.map((q, index) => {
                if (index > currentGuidedStep) return null;
                const isActive = index === currentGuidedStep;
                const isAnswered = guidedAnswers[q.id] !== undefined;

                return (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      "space-y-4 rounded-2xl border-2 p-6 transition-all",
                      isActive
                        ? "border-primary/50 bg-gradient-to-br from-primary/5 to-background"
                        : "border-border/30 bg-muted/20 opacity-75",
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-base font-semibold mb-1 flex items-center gap-2">
                          {isAnswered && (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          )}
                          {q.question}
                        </h4>
                        {isAnswered && (
                          <p className="text-sm text-muted-foreground">
                            Réponse: {q.choices.find(c => c.value === guidedAnswers[q.id])?.label}
                          </p>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {q.choices.map((choice, choiceIndex) => (
                          <motion.button
                            key={choice.value}
                            whileHover={{ scale: 1.03, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleGuidedChoice(q.id, choice.value)}
                            className={cn(
                              "relative p-4 rounded-xl border-2 transition-all",
                              "hover:border-primary/50 hover:shadow-lg",
                              "bg-gradient-to-br from-background to-muted/30",
                              "border-border",
                            )}
                            disabled={loading}
                          >
                            <div className="flex flex-col items-center gap-3">
                              <span className="text-2xl">{choice.icon}</span>
                              <span className="text-sm font-medium text-center">
                                {choice.label}
                              </span>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {!loading && currentGuidedStep > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetGuided}
                  className="w-full"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Recommencer
                </Button>
              )}
            </motion.div>
          )}

          {!guidedMode && messages.map((message) => {
            if ("question" in message) {
              const isLatestQuestion = latestQuestionMessage?.id === message.id;
              const canInteract = isLatestQuestion && !loading && !hasFinished;
              const questionKey = `${message.id}-0`;
              const selectedForQuestion = selectedOptions[questionKey] ?? [];

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
                          const isSelected =
                            selectedForQuestion.includes(option);
                          const icons = [Zap, Target, Sparkles];
                          const Icon = icons[optionIndex % icons.length];
                          const gradients = [
                            "from-blue-500/10 to-cyan-500/10",
                            "from-orange-500/10 to-red-500/10",
                            "from-purple-500/10 to-pink-500/10",
                          ];

                          return (
                            <motion.div
                              key={`${questionKey}-option-${optionIndex}`}
                              whileHover={
                                canInteract ? { scale: 1.03, y: -4 } : {}
                              }
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
                                canInteract
                                  ? ""
                                  : "opacity-60 cursor-not-allowed",
                                isSelected
                                  ? "border-primary shadow-glow scale-[1.02]"
                                  : "border-border hover:border-primary/50",
                              )}
                            >
                              {isSelected && (
                                <motion.div
                                  layoutId={`selected-${message.id}`}
                                  className="absolute inset-0 rounded-2xl border-4 border-primary/50"
                                  transition={{
                                    type: "spring",
                                    bounce: 0.2,
                                    duration: 0.6,
                                  }}
                                />
                              )}

                              <div className="flex flex-col items-center gap-4 relative z-10">
                                <div
                                  className={cn(
                                    "p-4 rounded-xl transition-all",
                                    isSelected
                                      ? "bg-primary/20 scale-110"
                                      : "bg-muted/50",
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      "w-8 h-8 transition-colors",
                                      isSelected
                                        ? "text-primary"
                                        : "text-muted-foreground",
                                    )}
                                  />
                                </div>

                                <p
                                  className={cn(
                                    "text-center font-medium leading-snug transition-colors",
                                    isSelected
                                      ? "text-primary"
                                      : "text-foreground",
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
            const rule = "rule" in message ? message.rule : undefined;
            const status = publishStatus[message.id] ?? "idle";
            const isPublishing = status === "loading";
            const isPublished = status === "success";
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
                {!isUser && rule && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handlePublishRule(message.id, rule)}
                      disabled={isPublishing || isPublished}
                    >
                      {isPublishing && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {isPublished
                        ? "Règle publiée"
                        : "Sauvegarder et Publier la Règle"}
                    </Button>
                    {isPublished ? (
                      <span className="text-xs text-muted-foreground">
                        Disponible dans le lobby.
                      </span>
                    ) : (
                      !user && (
                        <span className="text-xs text-muted-foreground">
                          Connectez-vous pour publier cette règle.
                        </span>
                      )
                    )}
                  </div>
                )}
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
