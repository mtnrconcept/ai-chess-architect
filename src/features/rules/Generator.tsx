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
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;
  const [guidedAnswers, setGuidedAnswers] = useState<GuidedAnswer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [guidedMode, setGuidedMode] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentQuestion]);

  const fetchNextQuestion = async (prompt: string) => {
    setLoadingQuestion(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-rule-questions", {
        body: { initialPrompt: prompt, previousAnswers: guidedAnswers },
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
      await fetchNextQuestion(initialPrompt);
    }
  };

  const startGuidedMode = async () => {
    if (!input.trim()) return;
    
    const promptValue = input.trim();
    setInitialPrompt(promptValue);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: promptValue },
    ]);
    setInput("");
    setGuidedMode(true);
    
    await fetchNextQuestion(promptValue);
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
          { role: "assistant", content: "✅ Règle générée avec succès !" },
        ]);

        // Reset retry sur succès
        setRetryCount(0);

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
            content: `ℹ️ ${result.message || "Plus d'informations nécessaires"}`,
          },
        ]);
      }
    } catch (error) {
      console.error("[handleSend] Error:", error);
      
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      
      // Gestion du retry uniquement pour erreurs réseau (pas 400/422)
      if (retryCount < MAX_RETRIES && !errorMessage.includes("invalide") && !errorMessage.includes("Crédits")) {
        setRetryCount((prev) => prev + 1);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `⚠️ ${errorMessage}\n\nNouvelle tentative (${retryCount + 1}/${MAX_RETRIES})...`,
          },
        ]);
        
        // Backoff exponentiel
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
        return handleSend(prompt, answers);
      }
      
      // Échec final
      setRetryCount(0);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${errorMessage}\n\nRéessayez ou reformulez votre demande.`,
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

async function generateRule(
  prompt: string,
  guidedAnswers?: GuidedAnswer[]
): Promise<{
  status: "ready" | "need_info";
  rule?: any;
  message?: string;
  httpStatus?: number;
}> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-chess-rule", {
      body: { prompt, guidedAnswers },
    });

    // 1️⃣ Gestion explicite des erreurs Supabase
    if (error) {
      console.error("[generateRule] Supabase error:", error);
      throw new Error(error.message || "Erreur de connexion");
    }

    // 2️⃣ Vérification de la structure de réponse
    if (!data) {
      console.error("[generateRule] Empty data from edge function");
      throw new Error("Aucune donnée reçue du serveur");
    }

    // 3️⃣ Log complet pour debug
    console.log("[generateRule] Full response:", JSON.stringify(data, null, 2));

    // 4️⃣ Gestion des statuts HTTP spéciaux (via data)
    if (!data.ok) {
      const errorType = data.error || "unknown_error";
      const errorMessage = data.message || data.reason || "Erreur inconnue";
      
      console.error(`[generateRule] Server error: ${errorType}`, data);
      
      // Cas spéciaux identifiés
      if (errorType === "rate_limited" || data.httpStatus === 429) {
        throw new Error("Trop de requêtes. Réessayez dans quelques secondes.");
      }
      if (errorType === "payment_required" || data.httpStatus === 402) {
        throw new Error("Crédits insuffisants. Ajoutez des crédits à votre workspace.");
      }
      if (errorType === "invalid_initial_prompt") {
        throw new Error(`Prompt invalide : ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    // 5️⃣ Extraction sécurisée de result
    const result = data.result;
    if (!result || typeof result !== "object") {
      console.error("[generateRule] Invalid result structure:", data);
      throw new Error("Structure de réponse invalide : 'result' manquant");
    }

    // 6️⃣ Cas "need_info" (422)
    if (result.status === "need_info") {
      console.warn("[generateRule] Model needs more info:", result.message);
      return {
        status: "need_info",
        message: result.message || "L'IA a besoin de plus d'informations",
        httpStatus: 422,
      };
    }

    // 7️⃣ Validation stricte de la règle
    const rule = result.rule;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      console.error("[generateRule] Invalid rule object:", rule);
      throw new Error("La règle générée est invalide (pas un objet)");
    }

    // 8️⃣ Vérification de la présence de meta (structure minimale)
    if (!rule.meta || typeof rule.meta !== "object") {
      console.error("[generateRule] Rule missing 'meta':", rule);
      throw new Error("La règle générée est incomplète (meta manquant)");
    }

    // 9️⃣ Vérification des logic.effects (pour éviter 0/0 rules loaded)
    if (!rule.logic?.effects || !Array.isArray(rule.logic.effects) || rule.logic.effects.length === 0) {
      console.error("[generateRule] Rule has no effects:", rule);
      throw new Error("La règle générée n'a aucun effet (logic.effects vide)");
    }

    // ✅ Tout est OK
    console.info("[generateRule] ✅ Valid rule generated with", rule.logic.effects.length, "effects");
    
    return {
      status: "ready",
      rule,
      httpStatus: 200,
    };

  } catch (error) {
    // Re-throw avec contexte préservé
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

export default RuleGenerator;
