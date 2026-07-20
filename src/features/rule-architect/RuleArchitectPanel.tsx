import { type ChangeEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  LockKeyhole,
  Rocket,
  ShieldCheck,
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
import type { RuleDiagnostic } from "@/rules-v2";
import { CompilationRecoveryActions } from "./CompilationRecoveryActions";
import { useRuleArchitect } from "./useRuleArchitect";

const EXAMPLES = [
  "Une fois tous les trois tours, un cavalier peut se téléporter sur n'importe quelle case vide. Cette action termine le tour et ne peut être utilisée que quatre fois par cavalier.",
  "Quand une tour capture une pièce, elle laisse un piège sur la case. La prochaine pièce qui entre sur cette case est capturée, puis le piège disparaît.",
  "À partir du dixième tour, chaque fou peut rendre une pièce ennemie gelée pendant deux tours, avec un cooldown de quatre tours.",
];

const severityOrder: Record<RuleDiagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const metricLabel = (value: number, inverse = false): string => {
  const score = inverse ? 100 - value : value;
  if (score >= 75) return "Excellent";
  if (score >= 50) return "Correct";
  if (score >= 25) return "Fragile";
  return "Critique";
};

const MetricBar = ({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: number;
  inverse?: boolean;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {value}/100 · {metricLabel(value, inverse)}
      </span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
        }}
      />
    </div>
  </div>
);

export default function RuleArchitectPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const architect = useRuleArchitect();
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [premium, setPremium] = useState(false);
  const [visibility, setVisibility] = useState<
    "private" | "unlisted" | "public"
  >("unlisted");
  const [lobbyName, setLobbyName] = useState("Ma variante IA");
  const [mode, setMode] = useState<"player" | "ai">("player");

  const diagnostics = useMemo(
    () =>
      [...(architect.compilation?.diagnostics ?? [])].sort(
        (left, right) =>
          severityOrder[left.severity] - severityOrder[right.severity],
      ),
    [architect.compilation],
  );

  const busy = ["compiling", "publishing", "creating-lobby"].includes(
    architect.phase,
  );

  const handleCompile = async () => {
    const cleaned = prompt.trim();
    if (cleaned.length < 20) {
      toast({
        title: "Prompt trop court",
        description:
          "Décris la règle, ses limites et le moment où elle s'applique.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await architect.compile(cleaned, premium);
      toast({
        title: result.ok ? "Règle compilée" : "Règle à corriger",
        description:
          premium && !result.premiumGranted
            ? "Le modèle standard a été utilisé car le compte ne possède pas l’accès premium."
            : result.ok
              ? "Relis les diagnostics avant de publier."
              : "Le serveur a refusé les éléments incohérents.",
        variant: result.ok ? "default" : "destructive",
      });
    } catch {
      // Le hook expose déjà le message.
    }
  };

  const handlePublish = async () => {
    try {
      const version = await architect.publish(visibility);
      toast({
        title: `Version ${version.versionNumber} publiée`,
        description: "Cette version est désormais immuable.",
      });
    } catch {
      // Le hook expose déjà le message.
    }
  };

  const handleCreateLobby = async () => {
    if (lobbyName.trim().length < 3) {
      toast({
        title: "Nom du lobby trop court",
        variant: "destructive",
      });
      return;
    }

    try {
      const lobby = await architect.createLobby(lobbyName.trim(), mode);
      toast({
        title: "Lobby sécurisé créé",
        description:
          lobby.matchSeed === null
            ? "Le ruleset est verrouillé. Le seed commun sera généré quand l’adversaire rejoindra le lobby."
            : "Le ruleset et le seed sont verrouillés.",
      });
      navigate(`/rule-lobby?lobbyId=${encodeURIComponent(lobby.lobbyId)}`);
    } catch {
      // Le hook expose déjà le message.
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <section className="overflow-hidden rounded-3xl border bg-card/80 p-6 shadow-2xl backdrop-blur sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <Badge variant="outline" className="gap-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              Rule Architect V2
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                Imagine une règle.
                <br />
                L’IA la rend jouable.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                GPT-5.6 transforme ton idée en blueprint strict. Le serveur la
                compile, la vérifie et crée une version immuable avant de
                l’ajouter à un lobby.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Décrire", "Écris la mécanique et ses limites."],
                ["2", "Valider", "Relis les risques et l’équilibrage."],
                ["3", "Jouer", "Publie puis ouvre un lobby."],
              ].map(([number, title, text]) => (
                <div
                  key={number}
                  className="rounded-2xl border bg-background/60 p-4"
                >
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {number}
                  </div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex min-h-64 items-center justify-center rounded-3xl border bg-background/40">
            <div className="absolute inset-8 rounded-full border border-primary/20" />
            <div className="absolute inset-16 rounded-full border border-primary/30" />
            <Swords className="h-28 w-28 text-primary" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Décris ta variante
            </CardTitle>
            <CardDescription>
              Précise le déclencheur, les pièces, les limites, le cooldown et le
              contre-jeu. Le prompt n’est pas publié avec la règle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <textarea
              value={prompt}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setPrompt(event.target.value)
              }
              disabled={busy}
              maxLength={4000}
              className="min-h-56 w-full resize-y rounded-2xl border bg-background p-4 text-sm leading-6 outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Exemple : une fois tous les trois tours..."
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Minimum recommandé : 80 caractères</span>
              <span>{prompt.length}/4000</span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Idées de départ</p>
              <div className="grid gap-2">
                {EXAMPLES.map((example, index) => (
                  <button
                    key={example}
                    type="button"
                    disabled={busy}
                    onClick={() => setPrompt(example)}
                    className="rounded-xl border p-3 text-left text-xs text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-50"
                  >
                    Variante {index + 1} — {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPremium(false)}
                className={`rounded-2xl border p-4 text-left transition ${
                  !premium ? "border-primary bg-primary/5" : ""
                }`}
              >
                <p className="font-semibold">GPT-5.6 Terra</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rapide et économique pour la majorité des variantes.
                </p>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPremium(true)}
                className={`rounded-2xl border p-4 text-left transition ${
                  premium ? "border-primary bg-primary/5" : ""
                }`}
              >
                <p className="font-semibold">GPT-5.6</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Raisonnement maximal pour les interactions complexes.
                </p>
              </button>
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              disabled={
                busy || architect.compileFailure?.newRequestRequired === true
              }
              onClick={handleCompile}
            >
              {architect.phase === "compiling" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Compilation et contrôles…
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4" />
                  Générer le blueprint
                </>
              )}
            </Button>

            {architect.compileFailure && (
              <CompilationRecoveryActions
                message={architect.compileFailure.message}
                code={architect.compileFailure.code}
                newRequestRequired={architect.compileFailure.newRequestRequired}
                disabled={busy}
                onRetry={() => {
                  void handleCompile();
                }}
                onReset={architect.resetCompilation}
              />
            )}

            {architect.error && !architect.compileFailure && (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {architect.error}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!architect.compilation && (
            <Card>
              <CardHeader>
                <CardTitle>Contrôle avant publication</CardTitle>
                <CardDescription>
                  La règle générée apparaîtra ici. Rien ne sera ajouté au lobby
                  automatiquement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {[
                    [
                      ShieldCheck,
                      "Catalogue fermé",
                      "Aucune opération inconnue n’est acceptée.",
                    ],
                    [
                      LockKeyhole,
                      "Version immuable",
                      "Une partie conserve exactement la règle publiée.",
                    ],
                    [
                      Swords,
                      "Replay déterministe",
                      "L’aléatoire est dérivé du seed du match.",
                    ],
                  ].map(([Icon, title, description]) => {
                    const Component = Icon as typeof ShieldCheck;
                    return (
                      <div
                        key={String(title)}
                        className="flex gap-3 rounded-2xl border p-4"
                      >
                        <Component className="mt-0.5 h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{String(title)}</p>
                          <p className="text-sm text-muted-foreground">
                            {String(description)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {architect.compilation && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>
                        {architect.compilation.blueprint?.title}
                      </CardTitle>
                      <CardDescription className="mt-2 max-w-xl">
                        {architect.compilation.blueprint?.summary}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        architect.compilation.ok ? "default" : "destructive"
                      }
                    >
                      {architect.compilation.ok ? "Compilable" : "Refusée"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MetricBar
                      label="Équilibrage estimé"
                      value={architect.compilation.metrics.balanceScore}
                    />
                    <MetricBar
                      label="Risque technique"
                      value={architect.compilation.metrics.riskScore}
                      inverse
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      ["Actions", architect.compilation.metrics.actionCount],
                      [
                        "Déclencheurs",
                        architect.compilation.metrics.triggerCount,
                      ],
                      ["Effets", architect.compilation.metrics.effectCount],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border p-3">
                        <p className="text-xl font-bold">{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {architect.compilation.blueprint?.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <p className="text-sm font-semibold">Comment jouer</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {
                        architect.compilation.blueprint?.explanation
                          .plainLanguage
                      }
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Modèle : {architect.compilation.model}
                    {architect.compilation.premiumRequested &&
                    !architect.compilation.premiumGranted
                      ? " (accès premium non accordé)"
                      : ""}{" "}
                    · Empreinte :{" "}
                    {architect.compilation.contentHash?.slice(0, 12) ??
                      "non créée"}
                    …
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Diagnostics</CardTitle>
                  <CardDescription>
                    Les erreurs bloquent la publication. Les avertissements
                    demandent une relecture.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {diagnostics.length === 0 && (
                    <div className="flex items-center gap-3 rounded-2xl border p-4">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <span className="text-sm">Aucun problème détecté.</span>
                    </div>
                  )}
                  {diagnostics.map((diagnostic, index) => (
                    <div
                      key={`${diagnostic.code}-${index}`}
                      className="flex gap-3 rounded-2xl border p-4"
                    >
                      {diagnostic.severity === "error" ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                      ) : diagnostic.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {diagnostic.message}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {diagnostic.code} · {diagnostic.path}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {architect.compilation.ok && !architect.publication && (
                <Card>
                  <CardHeader>
                    <CardTitle>Publier une version</CardTitle>
                    <CardDescription>
                      La version publiée devient immuable. Une nouvelle
                      modification créera une nouvelle version.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                      onClick={handlePublish}
                    >
                      {architect.phase === "publishing" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LockKeyhole className="h-4 w-4" />
                      )}
                      Publier la version immuable
                    </Button>
                  </CardContent>
                </Card>
              )}

              {architect.publication && (
                <Card>
                  <CardHeader>
                    <CardTitle>Créer le lobby</CardTitle>
                    <CardDescription>
                      Version {architect.publication.versionNumber} ·{" "}
                      {architect.publication.legacyRuleId}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input
                      value={lobbyName}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setLobbyName(event.target.value)
                      }
                      disabled={busy}
                      maxLength={80}
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                      placeholder="Nom du lobby"
                    />
                    <select
                      value={mode}
                      disabled={busy}
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
                      onClick={handleCreateLobby}
                    >
                      {architect.phase === "creating-lobby" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="h-4 w-4" />
                      )}
                      Créer et verrouiller le lobby
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={architect.reset}
              >
                Créer une autre règle
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
