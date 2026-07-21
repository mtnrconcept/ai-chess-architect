import { type ChangeEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  GraduationCap,
  Loader2,
  LockKeyhole,
  Puzzle,
  Rocket,
  RotateCcw,
  Sparkles,
  Swords,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  buildGuidedRulePrompt,
  requestRuleGuidance,
  type RuleGuidanceQuestion,
  type RuleGuidanceResponse,
} from "./guidance-api";
import { useRuleArchitect } from "./useRuleArchitect";

const STARTER_IDEAS = [
  "Les pions peuvent déposer des sables mouvants sur une case. La prochaine pièce qui y entre est ralentie ou capturée.",
  "Quand une pièce est capturée, un dragon arrive, l’emporte et une animation se joue sans modifier le résultat du coup.",
  "Chaque fou peut geler une pièce ennemie pendant deux tours, avec un délai de récupération et un contre-jeu clair.",
];

const stepLabels = ["Idée", "Clarification", "Validation", "Lobby"];

const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error && caught.message.trim() ? caught.message : fallback;

export default function GuidedRuleArchitectPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const architect = useRuleArchitect();
  const [idea, setIdea] = useState(STARTER_IDEAS[0]);
  const [guidance, setGuidance] = useState<RuleGuidanceResponse | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [acceptedAdjustments, setAcceptedAdjustments] = useState<Set<string>>(
    new Set(),
  );
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);
  const [visibility, setVisibility] = useState<
    "private" | "unlisted" | "public"
  >("unlisted");
  const [lobbyName, setLobbyName] = useState("Ma variante Voltus");
  const [mode, setMode] = useState<"player" | "ai">("player");

  const busy =
    guidanceLoading ||
    ["compiling", "publishing", "creating-lobby"].includes(architect.phase);

  const currentStep = architect.publication
    ? 4
    : architect.compilation
      ? 3
      : guidance
        ? 2
        : 1;

  const allRequiredAnswersSelected = useMemo(
    () =>
      guidance?.questions.every((question) => {
        const count = selections[question.id]?.length ?? 0;
        return count >= question.minSelections && count <= question.maxSelections;
      }) ?? false,
    [guidance, selections],
  );

  const diagnostics = architect.compilation?.diagnostics ?? [];
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  const initialiseRecommendedSelections = (result: RuleGuidanceResponse) => {
    const defaults: Record<string, string[]> = {};
    result.questions.forEach((question) => {
      const recommended = question.choices
        .filter((choice) => choice.recommended)
        .slice(0, Math.max(question.minSelections, 1))
        .map((choice) => choice.id);
      defaults[question.id] = recommended;
    });
    setSelections(defaults);
    setAcceptedAdjustments(
      new Set(
        result.adjustments
          .filter((adjustment) => adjustment.recommended)
          .map((adjustment) => adjustment.id),
      ),
    );
  };

  const analyseIdea = async (diagnosticMessages: string[] = []) => {
    const prompt = idea.trim();
    if (prompt.length < 12) {
      toast({
        title: "Décris un peu plus ton idée",
        description: "Indique au minimum la pièce ou l’événement concerné.",
        variant: "destructive",
      });
      return;
    }

    setGuidanceLoading(true);
    setGuidanceError(null);
    try {
      const result = await requestRuleGuidance({
        prompt,
        diagnostics: diagnosticMessages,
      });
      setGuidance(result);
      initialiseRecommendedSelections(result);
      architect.reset();
    } catch (caught) {
      setGuidanceError(
        errorMessage(caught, "Impossible d’analyser cette idée pour le moment."),
      );
    } finally {
      setGuidanceLoading(false);
    }
  };

  const toggleChoice = (
    question: RuleGuidanceQuestion,
    choiceId: string,
  ) => {
    setSelections((previous) => {
      const selected = new Set(previous[question.id] ?? []);
      if (question.selectionMode === "single") {
        return { ...previous, [question.id]: [choiceId] };
      }

      if (selected.has(choiceId)) {
        if (selected.size > question.minSelections) selected.delete(choiceId);
      } else if (selected.size < question.maxSelections) {
        selected.add(choiceId);
      }
      return { ...previous, [question.id]: Array.from(selected) };
    });
  };

  const handleCompile = async () => {
    if (!guidance || !allRequiredAnswersSelected) return;
    const prompt = buildGuidedRulePrompt({
      originalPrompt: idea,
      guidance,
      selections,
      acceptedAdjustmentIds: acceptedAdjustments,
    });

    try {
      const result = await architect.compile(prompt, premium);
      if (premium && !result.premiumGranted) {
        toast({
          title: "Variante générée avec le modèle standard",
          description:
            "Le mode premium n’est pas actif sur ce compte. Le parcours continue normalement.",
        });
      } else {
        toast({
          title: result.ok ? "Variante prête" : "Ajustement encore nécessaire",
          description: result.ok
            ? "La règle est compilée et peut être publiée."
            : "L’assistant peut reprendre automatiquement les diagnostics.",
          variant: result.ok ? "default" : "destructive",
        });
      }
    } catch {
      // Le hook affiche déjà l’erreur exploitable.
    }
  };

  const repairFromDiagnostics = async () => {
    const messages = blockingDiagnostics.map(
      (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`,
    );
    await analyseIdea(messages);
  };

  const handlePublish = async () => {
    try {
      const version = await architect.publish(visibility);
      toast({
        title: `Version ${version.versionNumber} publiée`,
        description: "La version est maintenant immuable et prête à jouer.",
      });
    } catch {
      // Le hook affiche déjà le message.
    }
  };

  const handleCreateLobby = async () => {
    if (lobbyName.trim().length < 3) {
      toast({ title: "Nom du lobby trop court", variant: "destructive" });
      return;
    }
    try {
      const lobby = await architect.createLobby(lobbyName.trim(), mode);
      toast({
        title: "Lobby créé",
        description:
          lobby.matchSeed === null
            ? "La règle est verrouillée jusqu’à l’arrivée de l’adversaire."
            : "La partie peut commencer.",
      });
      navigate(`/rule-lobby?lobbyId=${encodeURIComponent(lobby.lobbyId)}`);
    } catch {
      // Le hook affiche déjà le message.
    }
  };

  const resetAll = () => {
    architect.reset();
    setGuidance(null);
    setSelections({});
    setAcceptedAdjustments(new Set());
    setGuidanceError(null);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
      <section className="overflow-hidden rounded-3xl border bg-card/90 p-5 shadow-2xl backdrop-blur sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge variant="outline" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" /> Rule Architect guidé
            </Badge>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              Décris l’idée. Voltus la rend jouable.
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              L’assistant clarifie les zones ambiguës, propose les ajustements
              nécessaires et conserve au maximum ton intention avant toute
              publication.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-2xl border bg-background/50 p-2 sm:gap-2">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const active = step <= currentStep;
              return (
                <div key={label} className="min-w-0 text-center">
                  <div
                    className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step < currentStep ? "✓" : step}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">
                    {label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>1. Ton idée de départ</CardTitle>
            <CardDescription>
              Une phrase suffit. L’assistant demandera les détails réellement
              utiles au lieu de refuser directement la règle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={idea}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setIdea(event.target.value)
              }
              disabled={busy}
              maxLength={6000}
              className="min-h-44 w-full resize-y rounded-2xl border bg-background p-4 text-sm leading-6 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Exemple : quand une pièce est capturée, un dragon l’emporte…"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>L’assistant complète les ambiguïtés</span>
              <span>{idea.length}/6000</span>
            </div>
            <div className="grid gap-2">
              {STARTER_IDEAS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setIdea(starter);
                    resetAll();
                  }}
                  className="rounded-xl border p-3 text-left text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
                >
                  {starter}
                </button>
              ))}
            </div>
            <Button
              className="w-full gap-2"
              size="lg"
              disabled={busy}
              onClick={() => void analyseIdea()}
            >
              {guidanceLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Analyser et me guider
            </Button>
            {guidanceError && (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {guidanceError}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {!guidance && !architect.compilation && (
            <Card>
              <CardHeader>
                <CardTitle>Ce que l’assistant vérifiera</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  [Swords, "Déclencheur", "Quand et pour quelle pièce ?"],
                  [Gauge, "Limites", "Cooldown, fréquence et portée."],
                  [CheckCircle2, "Contre-jeu", "Comment l’adversaire répond."],
                  [Sparkles, "Présentation", "Animation et effets sans code libre."],
                ].map(([Icon, title, description]) => {
                  const Component = Icon as typeof Swords;
                  return (
                    <div key={String(title)} className="flex gap-3 rounded-2xl border p-4">
                      <Component className="h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="font-semibold">{String(title)}</p>
                        <p className="text-sm text-muted-foreground">
                          {String(description)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {guidance && !architect.compilation && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>2. Précise la variante</CardTitle>
                    <CardDescription className="mt-2">
                      {guidance.summary}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      guidance.feasibility === "direct" ? "default" : "secondary"
                    }
                  >
                    {guidance.feasibility === "direct"
                      ? "Directement réalisable"
                      : guidance.feasibility === "adaptable"
                        ? "Réalisable avec ajustements"
                        : "Conversion guidée"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {guidance.questions.map((question, questionIndex) => (
                  <section key={question.id} className="rounded-2xl border p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">
                      Question {questionIndex + 1}
                    </p>
                    <h3 className="mt-1 font-semibold">{question.question}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {question.help}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {question.choices.map((choice) => {
                        const checked = (
                          selections[question.id] ?? []
                        ).includes(choice.id);
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleChoice(question, choice.id)}
                            className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
                              checked
                                ? "border-primary bg-primary/10"
                                : "hover:border-primary/60"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
                                question.selectionMode === "single"
                                  ? "rounded-full"
                                  : "rounded"
                              } ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}
                            >
                              {checked ? "✓" : ""}
                            </span>
                            <span>
                              <span className="flex flex-wrap items-center gap-2 font-medium">
                                {choice.label}
                                {choice.recommended && (
                                  <Badge variant="outline">Recommandé</Badge>
                                )}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {choice.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {guidance.adjustments.length > 0 && (
                  <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <h3 className="font-semibold">Ajustements proposés</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ils rapprochent la demande du moteur disponible sans changer
                      son idée centrale.
                    </p>
                    <div className="mt-3 space-y-2">
                      {guidance.adjustments.map((adjustment) => {
                        const checked = acceptedAdjustments.has(adjustment.id);
                        return (
                          <label
                            key={adjustment.id}
                            className="flex cursor-pointer gap-3 rounded-xl border p-3"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy}
                              onChange={() =>
                                setAcceptedAdjustments((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(adjustment.id)) next.delete(adjustment.id);
                                  else next.add(adjustment.id);
                                  return next;
                                })
                              }
                            />
                            <span>
                              <span className="font-medium">{adjustment.label}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {adjustment.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPremium(false)}
                    className={`rounded-2xl border p-4 text-left ${
                      !premium ? "border-primary bg-primary/10" : ""
                    }`}
                  >
                    <p className="font-semibold">GPT-5.6 Terra</p>
                    <p className="text-xs text-muted-foreground">
                      Rapide, inclus et adapté à la plupart des variantes.
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPremium(true)}
                    className={`rounded-2xl border p-4 text-left ${
                      premium ? "border-primary bg-primary/10" : ""
                    }`}
                  >
                    <p className="font-semibold">GPT-5.6 Sol</p>
                    <p className="text-xs text-muted-foreground">
                      Raisonnement renforcé si ton compte y a accès.
                    </p>
                  </button>
                </div>

                <Button
                  className="w-full gap-2"
                  size="lg"
                  disabled={busy || !allRequiredAnswersSelected}
                  onClick={() => void handleCompile()}
                >
                  {architect.phase === "compiling" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Créer la variante jouable
                </Button>
              </CardContent>
            </Card>
          )}

          {architect.compilation && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {architect.compilation.blueprint?.title || "Variante en cours"}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {architect.compilation.blueprint?.summary}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={architect.compilation.ok ? "default" : "destructive"}
                  >
                    {architect.compilation.ok ? "Prête" : "À ajuster"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {architect.compilation.blueprint?.explanation.plainLanguage && (
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <p className="font-semibold">Comment jouer</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {architect.compilation.blueprint.explanation.plainLanguage}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Équilibre", architect.compilation.metrics.balanceScore],
                    ["Risque", architect.compilation.metrics.riskScore],
                    ["Effets", architect.compilation.metrics.effectCount],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border p-3">
                      <p className="text-xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {diagnostics.length > 0 && (
                  <div className="space-y-2">
                    {diagnostics.map((diagnostic, index) => (
                      <div
                        key={`${diagnostic.code}-${index}`}
                        className="flex gap-3 rounded-xl border p-3"
                      >
                        {diagnostic.severity === "error" ? (
                          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{diagnostic.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {diagnostic.code}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!architect.compilation.ok && (
                  <Button
                    className="w-full gap-2"
                    disabled={busy}
                    onClick={() => void repairFromDiagnostics()}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Réparer avec l’assistant
                  </Button>
                )}

                {architect.compilation.ok && !architect.publication && (
                  <div className="space-y-3 rounded-2xl border p-4">
                    <select
                      value={visibility}
                      disabled={busy}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setVisibility(event.target.value as typeof visibility)
                      }
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    >
                      <option value="private">Privée</option>
                      <option value="unlisted">Non répertoriée</option>
                      <option value="public">Publique</option>
                    </select>
                    <Button
                      className="w-full gap-2"
                      disabled={busy}
                      onClick={() => void handlePublish()}
                    >
                      <LockKeyhole className="h-4 w-4" />
                      Publier la version immuable
                    </Button>
                  </div>
                )}

                {architect.publication && (
                  <div className="space-y-3 rounded-2xl border p-4">
                    <input
                      value={lobbyName}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setLobbyName(event.target.value)
                      }
                      maxLength={80}
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    />
                    <select
                      value={mode}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setMode(event.target.value as typeof mode)
                      }
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    >
                      <option value="player">Contre un joueur</option>
                      <option value="ai">Contre l’IA</option>
                    </select>
                    <Button
                      className="w-full gap-2"
                      size="lg"
                      disabled={busy}
                      onClick={() => void handleCreateLobby()}
                    >
                      <Rocket className="h-4 w-4" /> Créer le lobby
                    </Button>
                  </div>
                )}

                {architect.error && (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {architect.error}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Swords, "Jouer", "/play-hub"],
            [Puzzle, "Puzzle du jour", "/daily-puzzle"],
            [GraduationCap, "Coach", "/coach"],
            [Gauge, "Analyser", "/analysis"],
          ].map(([Icon, label, path]) => {
            const Component = Icon as typeof Swords;
            return (
              <Button
                key={String(label)}
                variant="outline"
                className="h-auto justify-start gap-3 p-4"
                onClick={() => navigate(String(path))}
              >
                <Component className="h-5 w-5 text-primary" />
                {String(label)}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
