import { useMemo, useState } from "react";
import {
  Award,
  Bolt,
  CalendarClock,
  ChevronRight,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const tournamentTiles = [
  {
    id: "rapid",
    title: "Rapid Invitational",
    rounds: "7 rounds · Swiss",
    icon: Trophy,
    accent: "from-amber-400 via-amber-300 to-yellow-200",
    description: "Tournoi phare avec invitations IA coachées",
  },
  {
    id: "blitz",
    title: "Blitz Open",
    rounds: "9 rounds · Swiss",
    icon: Bolt,
    accent: "from-cyan-400 via-cyan-300 to-sky-200",
    description: "Format rapide avec classement mondial Voltus",
  },
  {
    id: "custom",
    title: "Custom Variants Cup",
    rounds: "5 rounds · Single elim",
    icon: Zap,
    accent: "from-fuchsia-500 via-pink-400 to-rose-300",
    description: "Jouez vos règles personnalisées dans un bracket dédié",
  },
  {
    id: "arena",
    title: "Arena Battle",
    rounds: "Unlimited",
    icon: Swords,
    accent: "from-blue-500 via-indigo-400 to-purple-400",
    description: "Marathon d'arène avec multiplicateurs de points",
  },
];

const tournamentData = {
  active: [
    {
      name: "Voltus Rapid Series #12",
      format: "7R · Swiss",
      players: 128,
      timeControl: "10+0",
      status: "Ronde 5 en cours",
    },
    {
      name: "Neon Arena",
      format: "Illimité",
      players: 356,
      timeControl: "3+2",
      status: "Live · 18 min restantes",
    },
  ],
  upcoming: [
    {
      name: "Voltus Blitz Cup",
      format: "9R · Swiss",
      players: 250,
      timeControl: "5+0",
      status: "Débute dans 4h",
    },
    {
      name: "Endgame Clinic",
      format: "4R · Round Robin",
      players: 32,
      timeControl: "15+10",
      status: "Inscription ouverte",
    },
  ],
  completed: [
    {
      name: "Voltus Masters Finals",
      format: "KO",
      players: 16,
      timeControl: "25+10",
      status: "Champion : LunaSparks",
    },
    {
      name: "Night Blitz Marathon",
      format: "Arena",
      players: 642,
      timeControl: "3+0",
      status: "Score gagnant : 128 pts",
    },
  ],
  mine: [
    {
      name: "Équipe Innovateurs",
      format: "5R · Swiss",
      players: 24,
      timeControl: "10+5",
      status: "Ronde 2 demain",
    },
  ],
};

type TournamentCategory = keyof typeof tournamentData;

const tabConfig: { id: TournamentCategory; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "upcoming", label: "À venir" },
  { id: "completed", label: "Terminés" },
  { id: "mine", label: "Mes tournois" },
];

const Tournaments = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TournamentCategory>("active");
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState({
    name: "",
    format: "swiss",
    rounds: "7",
    timeControl: "5+0",
  });

  const counts = useMemo(() => {
    return Object.fromEntries(
      Object.entries(tournamentData).map(([key, list]) => [key, list.length])
    ) as Record<TournamentCategory, number>;
  }, []);

  const handleCreate = () => {
    if (!form.name.trim()) {
      toast({
        title: "Nom requis",
        description: "Veuillez donner un nom à votre tournoi avant de créer.",
      });
      return;
    }

    toast({
      title: "Tournoi créé",
      description: `${form.name} est maintenant programmé en mode ${form.format.toUpperCase()} (${form.rounds} rondes).`,
    });
    setOpenDialog(false);
    setForm({ name: "", format: "swiss", rounds: "7", timeControl: "5+0" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030314] py-16 px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,0,200,0.16),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-cyan-500/25 bg-black/45 p-8 shadow-[0_0_45px_rgba(34,211,238,0.25)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Voltus Chess</span>
            <h1 className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-bold text-transparent">
              Portail des tournois
            </h1>
            <p className="text-sm text-cyan-100/70">
              Gérez vos compétitions actives, planifiez des événements futurs et rejoignez les tournois communautaires.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {tournamentTiles.map(tile => {
              const Icon = tile.icon;
              return (
                <Card key={tile.id} className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/50 p-5 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
                  <div className={`pointer-events-none absolute inset-x-6 top-0 h-1 rounded-b-full bg-gradient-to-r ${tile.accent}`} />
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10">
                        <Icon className="h-5 w-5 text-cyan-200" />
                      </span>
                      <CardTitle className="text-base font-semibold text-white">{tile.title}</CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-cyan-200/70" />
                  </CardHeader>
                  <CardContent className="mt-4 space-y-3 p-0">
                    <p className="text-xs text-cyan-100/60">{tile.description}</p>
                    <Badge className="w-fit rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 text-black">
                      {tile.rounds}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as TournamentCategory)} className="space-y-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-cyan-500/20 bg-black/40 p-4 backdrop-blur-lg md:flex-row md:items-center md:justify-between">
            <TabsList className="flex h-auto flex-wrap gap-3 rounded-2xl bg-black/40 p-3">
              {tabConfig.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`rounded-xl border border-transparent px-5 py-2 text-sm transition-all ${
                    activeTab === tab.id
                      ? "border-cyan-400/60 bg-cyan-500/10 text-white shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                      : "text-cyan-100/70 hover:border-cyan-400/40 hover:bg-cyan-500/5"
                  }`}
                >
                  <span className="mr-2 rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-semibold text-cyan-200/80">
                    {counts[tab.id]}
                  </span>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button className="rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-6 text-black shadow-[0_0_30px_rgba(34,211,238,0.35)]">
                  Créer un tournoi
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg border-cyan-400/40 bg-black/80 text-white">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold">Nouveau tournoi personnalisé</DialogTitle>
                  <p className="text-sm text-cyan-100/70">
                    Configurez le format, le nombre de rondes et le temps pour lancer une nouvelle compétition Voltus.
                  </p>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom du tournoi</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
                      placeholder="Ex : Voltus Pro League"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Format</Label>
                      <Select
                        value={form.format}
                        onValueChange={value => setForm(prev => ({ ...prev, format: value }))}
                      >
                        <SelectTrigger className="rounded-xl border-cyan-400/30 bg-black/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="swiss">Système suisse</SelectItem>
                          <SelectItem value="arena">Arène</SelectItem>
                          <SelectItem value="round">Toutes rondes</SelectItem>
                          <SelectItem value="ko">Élimination directe</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre de rondes</Label>
                      <Select
                        value={form.rounds}
                        onValueChange={value => setForm(prev => ({ ...prev, rounds: value }))}
                      >
                        <SelectTrigger className="rounded-xl border-cyan-400/30 bg-black/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, index) => index + 3).map(round => (
                            <SelectItem key={round} value={round.toString()}>
                              {round}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Cadence</Label>
                    <Input
                      value={form.timeControl}
                      onChange={event => setForm(prev => ({ ...prev, timeControl: event.target.value }))}
                      placeholder="Ex : 5+0"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="rounded-xl border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
                    onClick={() => setOpenDialog(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCreate}
                    className="rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-6 text-black shadow-[0_0_30px_rgba(34,211,238,0.35)]"
                  >
                    Créer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {tabConfig.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6 space-y-4">
              {tournamentData[tab.id].map(tournament => (
                <Card key={tournament.name} className="flex flex-col gap-4 rounded-2xl border border-cyan-400/20 bg-black/50 p-5 shadow-[0_0_25px_rgba(34,211,238,0.2)] md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-white">{tournament.name}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-cyan-100/70">
                      <span className="flex items-center gap-1">
                        <Award className="h-4 w-4 text-cyan-300" /> {tournament.format}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bolt className="h-4 w-4 text-fuchsia-300" /> {tournament.timeControl}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-4 w-4 text-amber-300" /> {tournament.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:items-end">
                    <Badge variant="outline" className="w-fit rounded-full border-cyan-500/40 text-cyan-100">
                      {tournament.players} joueurs
                    </Badge>
                    <Button variant="outline" className="rounded-xl border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10">
                      Voir les détails
                    </Button>
                  </div>
                </Card>
              ))}
              {tournamentData[tab.id].length === 0 && (
                <Card className="rounded-2xl border border-cyan-400/20 bg-black/40 p-10 text-center text-cyan-100/70">
                  Aucun tournoi dans cette catégorie pour le moment.
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default Tournaments;
