import { useMemo, useState } from "react";
import {
  Bolt,
  ChartBar,
  ChartLine,
  Clock,
  Compass,
  Crosshair,
  Flame,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from "recharts";

const evaluationData = [
  { move: "Ouverture", score: 0.3 },
  { move: "Milieu", score: -0.4 },
  { move: "Milieu+", score: 0.6 },
  { move: "Finale", score: 1.2 },
];

const moveTimeData = [
  { phase: "0-10", value: 18 },
  { phase: "10-20", value: 24 },
  { phase: "20-30", value: 32 },
  { phase: "30-40", value: 17 },
  { phase: "40+", value: 11 },
];

const blunderData = [
  { phase: "Opening", value: 1 },
  { phase: "Middlegame", value: 3 },
  { phase: "Endgame", value: 0 },
];

const mistakeData = [
  { phase: "Opening", value: 2 },
  { phase: "Middlegame", value: 1 },
  { phase: "Endgame", value: 1 },
];

const imbalanceData = [
  { phase: "Opening", value: 0.1 },
  { phase: "Milieu", value: -0.4 },
  { phase: "Finale", value: -0.8 },
];

const statsData = [
  { label: "Pions", white: 8, black: 6 },
  { label: "Pièces légères", white: 4, black: 3 },
  { label: "Pièces lourdes", white: 2, black: 1 },
  { label: "Rois", white: 1, black: 1 },
];

const phases = [
  { id: "last", label: "Dernière partie" },
  { id: "7-days", label: "7 jours" },
  { id: "30-days", label: "30 jours" },
  { id: "custom", label: "Personnalisé" },
];

const MatchAnalysis = () => {
  const [activePhase, setActivePhase] = useState("last");

  const accuracy = useMemo(() => 81.3, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030314] py-16 px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,230,255,0.22),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_85%,rgba(255,0,200,0.18),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-cyan-500/25 bg-black/50 p-8 shadow-[0_0_45px_rgba(34,211,238,0.25)] backdrop-blur-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/80">Voltus Chess</span>
              <h1 className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-bold text-transparent">
                Analyse post-partie
              </h1>
              <p className="text-sm text-cyan-100/70">
                Résumé automatisé de vos performances et recommandations d'entraînement basées sur la dernière partie jouée.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {phases.map(phase => (
                <Button
                  key={phase.id}
                  variant={activePhase === phase.id ? "default" : "outline"}
                  onClick={() => setActivePhase(phase.id)}
                  className={`rounded-xl border-cyan-500/40 ${
                    activePhase === phase.id
                      ? "bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 text-black shadow-[0_0_30px_rgba(34,211,238,0.45)]"
                      : "border-cyan-500/40 bg-transparent text-cyan-100/80 hover:bg-cyan-500/10"
                  }`}
                >
                  {phase.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-[minmax(0,240px)_1fr]">
            <Card className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-cyan-500/10 shadow-inner shadow-cyan-500/20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),transparent_70%)]" />
              <CardContent className="relative z-10 flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="relative flex h-40 w-40 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-cyan-400/40" />
                  <div className="absolute inset-4 rounded-full border border-fuchsia-400/40" />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(from 140deg, rgba(34,211,238,0.45) 0deg, rgba(34,211,238,0.45) ${Math.round((accuracy / 100) * 360)}deg, rgba(15,23,42,0.35) ${Math.round((accuracy / 100) * 360)}deg)`
                    }}
                  />
                  <div className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-full bg-black/70 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
                    <span className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Précision</span>
                    <span className="text-4xl font-bold text-white">{accuracy.toFixed(1)}%</span>
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full border-cyan-400/40 bg-cyan-500/10 text-cyan-100">
                  Delta Elo estimé : +6
                </Badge>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 p-6 shadow-inner shadow-cyan-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0">
                <div>
                  <CardTitle className="text-lg font-semibold text-white">Moments clés</CardTitle>
                  <p className="text-xs text-cyan-100/60">Les phases où vos décisions ont le plus impacté l'évaluation.</p>
                </div>
                <Bolt className="h-6 w-6 text-amber-300" />
              </CardHeader>
              <CardContent className="mt-6 grid gap-4 p-0 sm:grid-cols-2">
                {[{
                  icon: Flame,
                  label: "Attaque décisive",
                  description: "36...Dg2+ a forcé la séquence gagnante",
                  value: "+2.8",
                },
                {
                  icon: Crosshair,
                  label: "Zone critique",
                  description: "Inexactitude dans la finale de tours",
                  value: "-1.4",
                },
                {
                  icon: Target,
                  label: "Plan recommandé",
                  description: "Convertir l'avantage via la poussée du pion passé",
                  value: "Focus", 
                },
                {
                  icon: Compass,
                  label: "Vision stratégique",
                  description: "Les échanges simplificateurs fonctionnent mieux après 30...Tb8",
                  value: "+1.1",
                }].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex flex-col gap-3 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/30 bg-black/60">
                            <Icon className="h-5 w-5 text-cyan-200" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">{item.label}</p>
                            <p className="text-xs text-cyan-100/60">{item.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-cyan-100">{item.value}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Évaluation</CardTitle>
              <ChartLine className="h-5 w-5 text-cyan-300" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <ChartContainer
                config={{ score: { label: "Évaluation", color: "hsl(183 97% 58%)" } }}
                className="h-48"
              >
                <LineChart data={evaluationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.2)" />
                  <XAxis dataKey="move" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Line type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={3} dot={false} />
                  <ChartTooltip cursor={{ stroke: "rgba(34,211,238,0.4)", strokeWidth: 1 }} content={<ChartTooltipContent />} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(255,0,200,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Temps par coup</CardTitle>
              <Clock className="h-5 w-5 text-fuchsia-300" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <ChartContainer
                config={{ value: { label: "Temps (s)", color: "hsl(316 91% 58%)" } }}
                className="h-48"
              >
                <BarChart data={moveTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(236,72,153,0.15)" vertical={false} />
                  <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Bar dataKey="value" radius={8} fill="var(--color-value)" />
                  <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(236,72,153,0.08)" }} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(255,180,0,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Déséquilibre matériel</CardTitle>
              <ChartBar className="h-5 w-5 text-amber-300" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <ChartContainer
                config={{ value: { label: "Avantage", color: "hsl(49 100% 64%)" } }}
                className="h-48"
              >
                <AreaChart data={imbalanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,204,21,0.2)" />
                  <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                  <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="rgba(250,204,21,0.25)" strokeWidth={3} />
                  <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Erreurs critiques</CardTitle>
              <Flame className="h-5 w-5 text-orange-300" />
            </CardHeader>
            <CardContent className="grid gap-6 p-6 pt-0 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Grosses erreurs</h3>
                <ChartContainer
                  config={{ value: { label: "Blunders", color: "hsl(7 88% 55%)" } }}
                  className="h-44"
                >
                  <BarChart data={blunderData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(248,113,113,0.2)" vertical={false} />
                    <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                    <Bar dataKey="value" radius={10} fill="var(--color-value)" />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(248,113,113,0.12)" }} />
                  </BarChart>
                </ChartContainer>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Inexactitudes</h3>
                <ChartContainer
                  config={{ value: { label: "Mistakes", color: "hsl(276 92% 65%)" } }}
                  className="h-44"
                >
                  <BarChart data={mistakeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(192,132,252,0.2)" vertical={false} />
                    <XAxis dataKey="phase" stroke="rgba(148,163,184,0.7)" tickLine={false} axisLine={false} />
                    <Bar dataKey="value" radius={10} fill="var(--color-value)" />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(192,132,252,0.12)" }} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-cyan-400/30 bg-black/50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <CardTitle className="text-lg font-semibold text-white">Statistiques matériaux</CardTitle>
              <Target className="h-5 w-5 text-cyan-300" />
            </CardHeader>
            <CardContent className="grid gap-4 p-6 pt-0">
              {statsData.map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                  <span className="text-sm font-semibold text-white">{item.label}</span>
                  <div className="flex items-center gap-3 text-xs text-cyan-100/70">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-300" /> Blancs : {item.white}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Noirs : {item.black}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-cyan-500/25 bg-black/50 p-6 text-center md:flex-row">
          <div>
            <h3 className="text-lg font-semibold text-white">Recommandations personnalisées</h3>
            <p className="text-sm text-cyan-100/70">
              Travaillez la gestion du temps en milieu de jeu et répétez la finale de tours avec pion passé.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="rounded-xl border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10">
              Exporter en PDF
            </Button>
            <Button className="rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-6 text-black shadow-[0_0_25px_rgba(34,211,238,0.35)]">
              Lancer une revue guidée
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default MatchAnalysis;
