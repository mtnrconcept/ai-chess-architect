import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { CompilationRecoveryActions } from "./CompilationRecoveryActions";
import {
  clearRuleArchitectSession,
  loadRuleArchitectSession,
  persistRuleArchitectDraft,
} from "./rule-architect-session";
import { useRuleArchitect } from "./useRuleArchitect";

const STARTER_IDEAS = [
  "Les pions peuvent déposer des sables mouvants sur une case. La prochaine pièce qui y entre est ralentie ou capturée.",
  "Quand une pièce est capturée, un dragon arrive, l’emporte et une animation se joue sans modifier le résultat du coup.",
  "Chaque fou peut geler une pièce ennemie pendant deux tours, avec un délai de récupération et un contre-jeu clair.",
];

const stepLabels = ["Idée", "Clarification", "Validation", "Lobby"];

const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error && caught.message.trim() ? caught.message : fallback;

const coverageStatusLabel = (status: string, userApproved: boolean): string => {
  if (status === "implemented") return "Implémentée";
  if (status === "adapted") {
    return userApproved ? "Adaptation approuvée" : "Adaptation non approuvée";
  }
  if (status === "unsupported") return "Non prise en charge";
  return "Clarification requise";
};

export default function GuidedRuleArchitectPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const navigationState = location.state as {
    ruleIdeaDraft?: unknown;
  } | null;
  const stateIdea =
    typeof navigationState?.ruleIdeaDraft === "string"
      ? navigationState.ruleIdeaDraft
      : "";
  const requestedIdea = (stateIdea || searchParams.get("idea") || "")
    .trim()
    .slice(0, 6000);
  const [restoredSession] = useState(() => {
    const restored = loadRuleArchitectSession();
    if (
      requestedIdea.length >= 8 &&
      restored &&
      restored.draft.idea.trim() !== requestedIdea
    ) {
      clearRuleArchitectSession();
      return null;
    }
    return restored;
  });
  const architect = useRuleArchitect(restoredSession);
  const restoredDraft = restoredSession?.draft;
  const initialIdea = requestedIdea || restoredDraft?.idea || "";
  const [idea, setIdea] = useState(
    initialIdea.length >= 8 ? initialIdea : STARTER_IDEAS[0],
  );
  const [guidance, setGuidance] = useState<RuleGuidanceResponse | null>(
    restoredDraft?.guidance ?? null,
  );
  const [analyzedIdea, setAnalyzedIdea] = useState<string | null>(
    restoredDraft?.analyzedIdea ?? null,
  );
  const [selections, setSelections] = useState<Record<string, string[]>>(
    restoredDraft?.selections ?? {},
  );
  const [acceptedAdjustments, setAcceptedAdjustments] = useState<Set<string>>(
    new Set(restoredDraft?.acceptedAdjustmentIds ?? []),
  );
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const [premium, setPremium] = useState(restoredDraft?.premium ?? false);
  const [visibility, setVisibility] = useState<
    "private" | "unlisted" | "public"
  >(restoredDraft?.visibility ?? "unlisted");
  const [lobbyName, setLobbyName] = useState(
    restoredDraft?.lobbyName ?? "Ma variante Voltus",
  );
  const [mode, setMode] = useState<"player" | "ai">("ai");
  const guidanceRequestSequence = useRef(0);

  useEffect(() => {
    persistRuleArchitectDraft({
      idea,
      analyzedIdea,
      guidance,
      selections,
      acceptedAdjustmentIds: Array.from(acceptedAdjustments),
      premium,
      visibility,
      lobbyName,
      mode: "ai",
    });
  }, [
    acceptedAdjustments,
    analyzedIdea,
    guidance,
    idea,
    lobbyName,
    premium,
    selections,
    visibility,
  ]);

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
        return (
          count >= question.minSelections && count <= question.maxSelections
        );
      }) ?? false,
    [guidance, selections],
  );

  const allRequiredAdjustmentsAccepted = useMemo(
    () =>
      guidance?.requirements.every(
        (requirement) =>
          requirement.feasibility === "direct" ||
          guidance.adjustments.some(
            (adjustment) =>
              acceptedAdjustments.has(adjustment.id) &&
              adjustment.requirementIds.includes(requirement.id),
          ),
      ) ?? false,
    [acceptedAdjustments, guidance],
  );

  const allUncertaintiesResolved =
    (guidance?.remainingUncertainty.length ?? 0) === 0;
  const guidanceMatchesIdea = guidance !== null && analyzedIdea === idea.trim();

  const diagnostics = architect.compilation?.diagnostics ?? [];
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  const initialiseRecommendedSelections = (result: RuleGuidanceResponse) => {
    const defaults: Record<string, string[]> = {};
    result.questions.forEach((question) => {
      defaults[question.id] = [];
    });
    setSelections(defaults);
    // Une adaptation modifie la demande : elle exige toujours un clic explicite.
    setAcceptedAdjustments(new Set());
    return defaults;
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

    const requestSequence = ++guidanceRequestSequence.current;
    setGuidanceLoading(true);
    setGuidanceError(null);
    try {
      const result = await requestRuleGuidance({
        prompt,
        diagnostics: diagnosticMessages,
      });
      if (requestSequence === guidanceRequestSequence.current) {
        const defaultSelections = initialiseRecommendedSelections(result);
        setGuidance(result);
        setAnalyzedIdea(prompt);
        // Un nouveau jeton invalide toutes les tentatives de l’ancien contrat.
        // Effacer d’abord rend aussi une interruption entre les deux écritures
        // fail-closed, sans jamais mélanger une compilation et une nouvelle idée.
        clearRuleArchitectSession();
        persistRuleArchitectDraft(
          {
            idea,
            analyzedIdea: prompt,
            guidance: result,
            selections: defaultSelections,
            acceptedAdjustmentIds: [],
            premium,
            visibility,
            lobbyName,
            mode: "ai",
          },
          { renewFromGuidanceToken: result.guidanceToken },
        );
        architect.reset();
      }
    } catch (caught) {
      if (requestSequence === guidanceRequestSequence.current) {
        setGuidanceError(
          errorMessage(
            caught,
            "Impossible d’analyser cette idée pour le moment.",
          ),
        );
      }
    } finally {
      if (requestSequence === guidanceRequestSequence.current) {
        setGuidanceLoading(false);
      }
    }
  };

  const toggleChoice = (question: RuleGuidanceQuestion, choiceId: string) => {
    setSelections((previous) => {
      const selected = new Set(previous[question.id] ?? []);
      if (question.selectionMode === "single") {
        return { ...previous, [question.id]: [choiceId] };
      }

      if (selected.has(choiceId)) {
        selected.delete(choiceId);
      } else if (selected.size < question.maxSelections) {
        selected.add(choiceId);
      }
      return { ...previous, [question.id]: Array.from(selected) };
    });
  };

  const handleCompile = async () => {
    if (
      !guidance ||
      !allRequiredAnswersSelected ||
      !allRequiredAdjustmentsAccepted ||
      !allUncertaintiesResolved ||
      !guidanceMatchesIdea
    ) {
      return;
    }
    const prompt = buildGuidedRulePrompt({
      originalPrompt: idea,
      guidance,
      selections,
      acceptedAdjustmentIds: acceptedAdjustments,
    });
    try {
      const result = await architect.compile(
        prompt,
        premium,
        guidance.guidanceToken,
        {
          answers: selections,
          acceptedAdjustmentIds: Array.from(acceptedAdjustments),
        },
      );
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
    if (mode !== "ai") {
      toast({
        title: "Multijoueur bientôt disponible",
        description:
          "Le runtime serveur autoritaire doit être actif avant d’ouvrir un lobby joueur.",
        variant: "destructive",
      });
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
    guidanceRequestSequence.current += 1;
    clearRuleArchitectSession();
    architect.reset();
    setGuidance(null);
    setAnalyzedIdea(null);
    setSelections({});
    setAcceptedAdjustments(new Set());
    setGuidanceError(null);
    setGuidanceLoading(false);
  };

  const updateIdea = (nextIdea: string) => {
    if (
      (guidance !== null ||
        guidanceLoading ||
        architect.compilation !== null) &&
      nextIdea.trim() !== analyzedIdea
    ) {
      resetAll();
    }
    setIdea(nextIdea);
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
                    aria-current={step === currentStep ? "step" : undefined}
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
            <label htmlFor="rule-idea" className="sr-only">
              Idée de règle d’échecs
            </label>
            <textarea
              id="rule-idea"
              value={idea}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                updateIdea(event.target.value)
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
                    resetAll();
                    setIdea(starter);
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
              <div
                role="alert"
                className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
              >
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
                  [
                    Sparkles,
                    "Présentation",
                    "Animation et effets sans code libre.",
                  ],
                ].map(([Icon, title, description]) => {
                  const Component = Icon as typeof Swords;
                  return (
                    <div
                      key={String(title)}
                      className="flex gap-3 rounded-2xl border p-4"
                    >
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
                      guidance.feasibility === "direct"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {guidance.feasibility === "direct"
                      ? "Directement réalisable"
                      : guidance.feasibility === "adaptable"
                        ? "Réalisable avec ajustements"
                        : "Certaines clauses non prises en charge"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <section className="rounded-2xl border bg-muted/20 p-4">
                  <h3 className="font-semibold">
                    Ce que l’assistant a compris
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Chaque exigence sera contrôlée après compilation. Aucune ne
                    peut disparaître silencieusement.
                  </p>
                  <div className="mt-3 space-y-2">
                    {guidance.requirements.map((requirement) => (
                      <div
                        key={requirement.id}
                        className="flex flex-col gap-2 rounded-xl border bg-background/60 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {requirement.statement}
                          </p>
                          {requirement.adaptation && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Adaptation proposée : {requirement.adaptation}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={
                            requirement.feasibility === "direct"
                              ? "default"
                              : "secondary"
                          }
                          className="w-fit shrink-0"
                        >
                          {requirement.feasibility === "direct"
                            ? "Directe"
                            : requirement.feasibility === "adaptable"
                              ? "Adaptable"
                              : "Non prise en charge"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </section>

                {guidance.questions.map((question, questionIndex) => (
                  <fieldset
                    key={question.id}
                    className="rounded-2xl border p-4"
                  >
                    <legend className="px-1 font-semibold">
                      {question.question}
                    </legend>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">
                      Question {questionIndex + 1}
                    </p>
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
                            aria-pressed={checked}
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
                  </fieldset>
                ))}

                {guidance.remainingUncertainty.length > 0 && (
                  <section
                    role="alert"
                    className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
                  >
                    <h3 className="font-semibold text-destructive">
                      Points encore ambigus
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      La compilation reste bloquée pour éviter d’inventer ou
                      d’oublier une règle. Relance l’analyse après avoir précisé
                      :
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {guidance.remainingUncertainty.map((uncertainty) => (
                        <li key={uncertainty}>{uncertainty}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {guidance.adjustments.length > 0 && (
                  <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <h3 className="font-semibold">Ajustements proposés</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ils rapprochent la demande du moteur disponible. Aucun
                      ajustement n’est accepté automatiquement : coche
                      uniquement ceux que tu valides.
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
                                  if (next.has(adjustment.id))
                                    next.delete(adjustment.id);
                                  else next.add(adjustment.id);
                                  return next;
                                })
                              }
                            />
                            <span>
                              <span className="font-medium">
                                {adjustment.label}
                              </span>
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
                    aria-pressed={!premium}
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
                    aria-pressed={premium}
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
                  disabled={
                    busy ||
                    architect.compileFailure?.newRequestRequired === true ||
                    !allRequiredAnswersSelected ||
                    !allRequiredAdjustmentsAccepted ||
                    !allUncertaintiesResolved ||
                    !guidanceMatchesIdea
                  }
                  onClick={() => void handleCompile()}
                >
                  {architect.phase === "compiling" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Créer la variante jouable
                </Button>
                {architect.compileFailure && (
                  <CompilationRecoveryActions
                    message={architect.compileFailure.message}
                    code={architect.compileFailure.code}
                    newRequestRequired={
                      architect.compileFailure.newRequestRequired
                    }
                    disabled={busy}
                    onRetry={() => void handleCompile()}
                    onReset={architect.resetCompilation}
                  />
                )}
                {architect.error && !architect.compileFailure && (
                  <div
                    role="alert"
                    className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {architect.error}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {architect.compilation && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {architect.compilation.blueprint?.title ||
                        "Variante en cours"}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {architect.compilation.blueprint?.summary}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      architect.compilation.ok ? "default" : "destructive"
                    }
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
                      {
                        architect.compilation.blueprint.explanation
                          .plainLanguage
                      }
                    </p>
                  </div>
                )}
                {architect.compilation.coverage && (
                  <section
                    className={`rounded-2xl border p-4 ${
                      architect.compilation.coverage.complete
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-destructive/40 bg-destructive/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">Audit de couverture</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {architect.compilation.coverage.summary}
                        </p>
                      </div>
                      <Badge
                        variant={
                          architect.compilation.coverage.complete
                            ? "default"
                            : "destructive"
                        }
                      >
                        {architect.compilation.coverage.score}% couvert
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {architect.compilation.coverage.requirements.map(
                        (requirement) => {
                          const source = guidance?.requirements.find(
                            (item) => item.id === requirement.id,
                          );
                          const covered =
                            requirement.status === "implemented" ||
                            (requirement.status === "adapted" &&
                              requirement.userApproved);
                          return (
                            <div
                              key={requirement.id}
                              className="flex gap-3 rounded-xl border bg-background/60 p-3"
                            >
                              {covered ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  {source?.statement ??
                                    (requirement.id === "request-fidelity"
                                      ? "Fidélité à l’idée originale complète"
                                      : requirement.id)}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {coverageStatusLabel(
                                    requirement.status,
                                    requirement.userApproved,
                                  )}{" "}
                                  — {requirement.explanation}
                                </p>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </section>
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
                          <p className="text-sm font-medium">
                            {diagnostic.message}
                          </p>
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
                    <label
                      htmlFor="rule-visibility"
                      className="text-sm font-medium"
                    >
                      Visibilité
                    </label>
                    <select
                      id="rule-visibility"
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
                    <label
                      htmlFor="rule-lobby-name"
                      className="text-sm font-medium"
                    >
                      Nom du lobby
                    </label>
                    <input
                      id="rule-lobby-name"
                      value={lobbyName}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setLobbyName(event.target.value)
                      }
                      maxLength={80}
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    />
                    <label
                      htmlFor="rule-lobby-mode"
                      className="text-sm font-medium"
                    >
                      Adversaire
                    </label>
                    <select
                      id="rule-lobby-mode"
                      value={mode}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setMode(event.target.value as typeof mode)
                      }
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                    >
                      <option value="ai">Contre l’IA</option>
                      <option value="player" disabled>
                        Contre un joueur — bientôt disponible
                      </option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Le mode joueur restera fermé jusqu’à l’activation du
                      runtime serveur autoritaire, afin que les deux joueurs ne
                      puissent jamais exécuter des plateaux divergents.
                    </p>
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
                  <div
                    role="alert"
                    className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                  >
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
            [Puzzle, "Puzzle du jour", "/play-hub"],
            [GraduationCap, "Coach", "/analysis"],
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
