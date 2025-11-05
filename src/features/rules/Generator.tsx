import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface GuidedAnswer {
  question: string;
  choice: string;
}

interface QuestionData {
  question: string;
  choices: string[];
  aspect: string;
}

export interface RuleGeneratorReadyPayload {
  result: {
    rule: any;
    prompt?: string;
    correlationId?: string | null;
    promptHash?: string | null;
    provider?: string | null;
  };
  warnings: string[];
}

interface GeneratorProps {
  onRuleReady?: (payload: RuleGeneratorReadyPayload) => void;
  disabled?: boolean;
  standalone?: boolean;
}


export function RuleGenerator({ onRuleReady, disabled }: GeneratorProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Décrivez votre idée de règle d'échecs (ex: les pions peuvent déposer des mines)",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [guidedAnswers, setGuidedAnswers] = useState<GuidedAnswer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [guidedMode, setGuidedMode] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentQuestion]);

  const fetchNextQuestion = async () => {
    setLoadingQuestion(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-rule-questions", {
        body: { initialPrompt, previousAnswers: guidedAnswers },
      });

      if (error) throw error;

      if (data?.ok && data?.question) {
        setCurrentQuestion(data.question);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.question.question },
        ]);
      } else {
        // Plus de questions, générer la règle
        setGuidedMode(false);
        await handleSend(initialPrompt, guidedAnswers);
      }
    } catch (error) {
      console.error("Error fetching question:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erreur lors du chargement de la question. Réessayez." },
      ]);
    } finally {
      setLoadingQuestion(false);
    }
  };

  const handleGuidedChoice = async (choice: string) => {
    if (!currentQuestion) return;

    const newAnswer: GuidedAnswer = {
      question: currentQuestion.question,
      choice: choice,
    };

    const updatedAnswers = [...guidedAnswers, newAnswer];
    setGuidedAnswers(updatedAnswers);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: choice },
    ]);

    // Vérifier si on a assez d'informations (4-5 questions max)
    if (updatedAnswers.length >= 4) {
      setGuidedMode(false);
      setCurrentQuestion(null);
      await handleSend(initialPrompt, updatedAnswers);
    } else {
      // Charger la prochaine question
      setCurrentQuestion(null);
      await fetchNextQuestion();
    }
  };

  const startGuidedMode = async () => {
    if (!input.trim()) return;
    
    setInitialPrompt(input);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: input },
    ]);
    setInput("");
    setGuidedMode(true);
    
    await fetchNextQuestion();
  };

  const handleSend = async (prompt?: string, answers?: GuidedAnswer[]) => {
    const messageToSend = prompt || input.trim();
    if (!messageToSend) return;

    setIsLoading(true);

    try {
      const result = await generateRule(messageToSend, answers);

      if (result.status === "ready" && result.rule) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Règle générée avec succès !" },
        ]);

        onRuleReady?.({
          result: {
            rule: result.rule,
            prompt: messageToSend,
            correlationId: null,
            promptHash: null,
            provider: "google/gemini-2.5-flash",
          },
          warnings: [],
        });
      } else if (result.status === "need_info") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.message || "Plus d'informations nécessaires",
          },
        ]);
      }
    } catch (error) {
      console.error("Error generating rule:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erreur lors de la génération. Réessayez.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetGuided = () => {
    setGuidedAnswers([]);
    setCurrentQuestion(null);
    setInitialPrompt("");
    setGuidedMode(false);
    setMessages([
      {
        role: "assistant",
        content: "Décrivez votre idée de règle d'échecs (ex: les pions peuvent déposer des mines)",
      },
    ]);
  };

  const canSend = input.trim().length > 0 && !isLoading && !guidedMode && !loadingQuestion && !disabled;

  return (
    <div className="flex flex-col h-full max-h-[600px] bg-card border rounded-lg">
      <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Générateur de Règles IA</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-4 py-2",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </motion.div>
        ))}

        {/* Questions guidées */}
        <AnimatePresence>
          {guidedMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {guidedAnswers.map((answer, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-muted-foreground">{answer.question}</p>
                    <p className="text-foreground font-medium">{answer.choice}</p>
                  </div>
                </div>
              ))}

              {loadingQuestion && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Génération de la prochaine question...</span>
                </div>
              )}

              {currentQuestion && !loadingQuestion && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-3 pt-2"
                >
                  <div className="grid gap-2">
                    {currentQuestion.choices.map((choice, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        onClick={() => handleGuidedChoice(choice)}
                        className="justify-start text-left h-auto py-3 hover:bg-accent/50"
                        disabled={loadingQuestion}
                      >
                        {choice}
                      </Button>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t bg-muted/20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) {
              startGuidedMode();
            }
          }}
          className="flex gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Décrivez votre idée de règle..."
            disabled={isLoading || guidedMode || loadingQuestion || disabled}
            className="flex-1 min-h-[60px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) {
                  startGuidedMode();
                }
              }
            }}
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="icon"
              disabled={!canSend}
              className="flex-shrink-0"
              onClick={startGuidedMode}
            >
              {isLoading || loadingQuestion ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
            {(guidedMode || guidedAnswers.length > 0) && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={resetGuided}
                disabled={isLoading || loadingQuestion || disabled}
              >
                <Sparkles className="w-4 h-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

async function generateRule(prompt: string, guidedAnswers?: GuidedAnswer[]): Promise<{
  status: "ready" | "need_info";
  rule?: any;
  message?: string;
}> {
  const { data, error } = await supabase.functions.invoke("generate-chess-rule", {
    body: { prompt, guidedAnswers },
  });

  if (error) {
    throw new Error(error.message || "Erreur lors de la génération");
  }

  if (!data || !data.ok) {
    throw new Error(data?.error || "Réponse invalide du serveur");
  }

  return {
    status: data.result?.status || "ready",
    rule: data.result?.rule,
    message: data.result?.message,
  };
}

export default RuleGenerator;
