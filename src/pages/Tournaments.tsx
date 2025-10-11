import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CalendarClock,
  Loader2,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchTournamentDetails,
  fetchTournamentLeaderboard,
  fetchTournamentOverview,
  fetchUserTournamentRegistrations,
  registerForTournament,
  reportTournamentMatch,
  requestTournamentMatch,
  syncTournaments,
} from "@/lib/tournamentApi";
import type { MatchmakingResponse, TournamentLeaderboardEntry, TournamentOverview } from "@/types/tournament";

const blockDurationHours = 2;

type TournamentTab = "running" | "upcoming" | "completed" | "mine";

type LeaderboardState = {
  loading: boolean;
  entries: TournamentLeaderboardEntry[];
};

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const computeTimeInfo = (tournament: TournamentOverview) => {
  const now = Date.now();
  const start = new Date(tournament.start_time).getTime();
  const end = new Date(tournament.end_time).getTime();

  if (now < start) {
    const minutes = Math.max(1, Math.round((start - now) / 60000));
    return `Débute dans ${minutes} min`;
  }

  if (now >= start && now < end) {
    const minutes = Math.max(1, Math.round((end - now) / 60000));
    return `Se termine dans ${minutes} min`;
  }

  return `Terminé le ${formatDateTime(tournament.end_time)}`;
};

const resolveUserDisplayName = (user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
  if (!user) return "Joueur";
  const metadata = user.user_metadata ?? {};
  const fromMetadata = ["full_name", "name", "username"]
    .map(key => {
      const value = metadata[key];
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    })
    .find(Boolean);

  if (fromMetadata) return fromMetadata;
  if (typeof user.email === "string" && user.email.length > 0) {
    return user.email.split("@")[0] ?? user.email;
  }
  return "Joueur";
};

const statusBadgeClasses: Record<TournamentTab, string> = {
  running: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30",
  upcoming: "bg-cyan-500/20 text-cyan-100 border-cyan-500/30",
  completed: "bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-500/30",
  mine: "bg-amber-500/20 text-amber-100 border-amber-500/30",
};

const TournamentStatusBadge = ({
  tournament,
}: {
  tournament: TournamentOverview;
}) => {
  const now = Date.now();
  const start = new Date(tournament.start_time).getTime();
  const end = new Date(tournament.end_time).getTime();

  if (now < start) {
    return <Badge className={statusBadgeClasses.upcoming}>Programmé</Badge>;
  }

  if (now >= start && now < end) {
    return <Badge className={statusBadgeClasses.running}>En cours</Badge>;
  }

  return <Badge className={statusBadgeClasses.completed}>Clôturé</Badge>;
};

const TournamentPage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TournamentTab>("running");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<LeaderboardState>({ loading: false, entries: [] });
  const [joiningTournamentId, setJoiningTournamentId] = useState<string | null>(null);
  const [registeringTournamentId, setRegisteringTournamentId] = useState<string | null>(null);
  const [reportingMatchId, setReportingMatchId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const {
    data: tournaments = [],
    isLoading: tournamentsLoading,
  } = useQuery({
    queryKey: ["tournaments"],
    queryFn: fetchTournamentOverview,
  });

  const { data: myRegistrations = [] } = useQuery({
    queryKey: ["my-tournament-registrations", user?.id],
    queryFn: () => fetchUserTournamentRegistrations(user!.id),
    enabled: Boolean(user?.id),
  });

  const registrationByTournament = useMemo(() => new Map(myRegistrations.map(reg => [reg.tournament_id, reg])), [
    myRegistrations,
  ]);

  const runningTournaments = useMemo(
    () => tournaments.filter(tournament => new Date(tournament.end_time).getTime() > Date.now()),
    [tournaments],
  );

  const activeTournaments = useMemo(
    () => runningTournaments.filter(tournament => new Date(tournament.start_time).getTime() <= Date.now()),
    [runningTournaments],
  );

  const upcomingTournaments = useMemo(
    () => runningTournaments.filter(tournament => new Date(tournament.start_time).getTime() > Date.now()),
    [runningTournaments],
  );

  const completedTournaments = useMemo(
    () => tournaments.filter(tournament => new Date(tournament.end_time).getTime() <= Date.now()),
    [tournaments],
  );

  const myTournamentList = useMemo(
    () => tournaments.filter(tournament => registrationByTournament.has(tournament.id)),
    [tournaments, registrationByTournament],
  );

  const ongoingMatchRegistration = useMemo(() => {
    if (!user) return null;
    return myRegistrations.find(
      registration =>
        registration.current_match &&
        registration.current_match.status !== "completed" &&
        registration.current_match.status !== "cancelled",
    );
  }, [myRegistrations, user]);

  const ongoingMatchTournament = useMemo(() => {
    if (!ongoingMatchRegistration) return null;
    return tournaments.find(tournament => tournament.id === ongoingMatchRegistration.tournament_id) ?? null;
  }, [ongoingMatchRegistration, tournaments]);

  useEffect(() => {
    const initialise = async () => {
      setSyncing(true);
      try {
        await syncTournaments();
        await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Impossible de synchroniser les tournois";
        toast({ title: "Synchronisation échouée", description: message, variant: "destructive" });
      } finally {
        setSyncing(false);
      }
    };

    void initialise();

    const interval = setInterval(() => void initialise(), 1000 * 60 * 15);
    return () => clearInterval(interval);
  }, [queryClient, toast]);

  const selectedDetailsQuery = useQuery({
    queryKey: ["tournament-details", selectedTournamentId],
    queryFn: () => fetchTournamentDetails(selectedTournamentId!),
    enabled: Boolean(selectedTournamentId),
  });

  const selectedTournament = useMemo(
    () => tournaments.find(tournament => tournament.id === selectedTournamentId) ?? null,
    [tournaments, selectedTournamentId],
  );

  const loadLeaderboard = async (tournamentId: string) => {
    setLeaderboardState({ loading: true, entries: [] });
    try {
      const entries = await fetchTournamentLeaderboard(tournamentId);
      setLeaderboardState({ loading: false, entries });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Classement inaccessible";
      toast({ title: "Erreur", description: message, variant: "destructive" });
      setLeaderboardState({ loading: false, entries: [] });
    }
  };

  const handleOpenDetails = (tournamentId: string) => {
    setSelectedTournamentId(tournamentId);
    setDetailsOpen(true);
    void loadLeaderboard(tournamentId);
  };

  const handleDetailsOpenChange = (open: boolean) => {
    setDetailsOpen(open);
    if (!open) {
      setSelectedTournamentId(null);
      setLeaderboardState({ loading: false, entries: [] });
    }
  };

  const handleRegister = async (tournament: TournamentOverview) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Identifiez-vous pour rejoindre un tournoi.",
        variant: "destructive",
      });
      return;
    }

    setRegisteringTournamentId(tournament.id);
    try {
      const displayName = resolveUserDisplayName(user);
      const avatarUrl = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata?.avatar_url : null;
      await registerForTournament(tournament.id, user.id, displayName, avatarUrl);
      toast({
        title: "Inscription confirmée",
        description: `Vous êtes inscrit à ${tournament.name}.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tournament-registrations", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
        queryClient.invalidateQueries({ queryKey: ["tournament-details", tournament.id] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de s'inscrire au tournoi";
      toast({ title: "Erreur d'inscription", description: message, variant: "destructive" });
    } finally {
      setRegisteringTournamentId(null);
    }
  };

  const handleJoinMatch = async (tournamentId: string) => {
    if (!user) {
      toast({ title: "Connexion requise", description: "Connectez-vous pour lancer une partie.", variant: "destructive" });
      return;
    }

    setJoiningTournamentId(tournamentId);
    try {
      const displayName = resolveUserDisplayName(user);
      const response: MatchmakingResponse = await requestTournamentMatch(tournamentId, displayName);
      if (response.match?.status === "pending") {
        toast({ title: "Salle créée", description: "Nous attendons un adversaire pour démarrer la partie." });
      } else if (response.match?.status === "in_progress") {
        toast({ title: "Adversaire trouvé", description: "Votre match de tournoi peut commencer." });
      } else {
        toast({ title: "Participation enregistrée", description: "Votre inscription est confirmée." });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tournament-registrations", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["tournament-details", tournamentId] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Matchmaking indisponible";
      toast({ title: "Impossible de rejoindre", description: message, variant: "destructive" });
    } finally {
      setJoiningTournamentId(null);
    }
  };

  const handleReportMatch = async (matchId: string, result: "player1" | "player2" | "draw") => {
    if (!user) return;
    setReportingMatchId(matchId);
    try {
      const payload = await reportTournamentMatch(matchId, result);
      toast({ title: "Résultat enregistré", description: "Le classement a été mis à jour." });
      if (payload?.leaderboard) {
        setLeaderboardState({ loading: false, entries: payload.leaderboard });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tournament-registrations", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
        queryClient.invalidateQueries({ queryKey: ["tournament-details", payload?.match?.tournament_id ?? selectedTournamentId] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'enregistrer le résultat";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setReportingMatchId(null);
    }
  };

  const summaryMetrics = useMemo(() => {
    const totalParticipants = tournaments.reduce((acc, tournament) => acc + tournament.player_count, 0);
    const completedMatches = tournaments.reduce((acc, tournament) => acc + tournament.completed_match_count, 0);
    const activeMatches = tournaments.reduce((acc, tournament) => acc + tournament.active_match_count, 0);

    return [
      {
        label: "Tournois en cours",
        value: activeTournaments.length,
        icon: Trophy,
        accent: "from-emerald-400 via-emerald-300 to-lime-200",
        description: `${blockDurationHours}h de compétition continue`,
      },
      {
        label: `Prochains ${blockDurationHours}h`,
        value: upcomingTournaments.length,
        icon: CalendarClock,
        accent: "from-cyan-400 via-sky-300 to-blue-200",
        description: "Programmés sur la prochaine fenêtre",
      },
      {
        label: "Participants",
        value: totalParticipants,
        icon: Users,
        accent: "from-fuchsia-400 via-pink-300 to-rose-200",
        description: "Joueurs inscrits sur les créneaux actifs",
      },
      {
        label: "Matches joués",
        value: completedMatches,
        icon: Award,
        accent: "from-amber-400 via-orange-300 to-yellow-200",
        description: `${activeMatches} matchs en cours actuellement`,
      },
    ];
  }, [activeTournaments.length, tournaments, upcomingTournaments.length]);

  const tabConfig: { id: TournamentTab; label: string; tournaments: TournamentOverview[] }[] = [
    { id: "running", label: "En cours", tournaments: activeTournaments },
    { id: "upcoming", label: "À venir", tournaments: upcomingTournaments },
    { id: "completed", label: "Terminés", tournaments: completedTournaments },
    { id: "mine", label: "Mes tournois", tournaments: myTournamentList },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030314] px-6 py-6 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,0,200,0.16),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col gap-8 rounded-3xl border border-cyan-500/25 bg-black/45 p-8 shadow-[0_0_45px_rgba(34,211,238,0.25)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Voltus Chess</span>
            <h1 className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-bold text-transparent">
              Portail des tournois
            </h1>
            <p className="text-sm text-cyan-100/70">
              Rejoignez des tournois toutes les deux heures, affrontez des joueurs connectés et suivez vos résultats en direct.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {summaryMetrics.map(metric => {
              const Icon = metric.icon;
              return (
                <Card
                  key={metric.label}
                  className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/50 p-5 shadow-[0_0_35px_rgba(34,211,238,0.2)]"
                >
                  <div className={`pointer-events-none absolute inset-x-6 top-0 h-1 rounded-b-full bg-gradient-to-r ${metric.accent}`} />
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10">
                        <Icon className="h-5 w-5 text-cyan-200" />
                      </span>
                      <div>
                        <CardTitle className="text-base font-semibold text-white">{metric.value}</CardTitle>
                        <p className="text-xs text-cyan-100/60">{metric.label}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-4 space-y-3 p-0">
                    <p className="text-xs text-cyan-100/60">{metric.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-cyan-500/20 bg-black/40 p-4 backdrop-blur-lg md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-cyan-100/70">
              {syncing || tournamentsLoading ? "Synchronisation des tournois en cours..." : "Programme mis à jour automatiquement toutes les 2h."}
            </div>
            <Button
              variant="outline"
              className="rounded-xl border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
              onClick={async () => {
                setSyncing(true);
                try {
                  await syncTournaments();
                  await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
                  toast({ title: "Programme rafraîchi" });
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Impossible de rafraîchir le programme";
                  toast({ title: "Erreur", description: message, variant: "destructive" });
                } finally {
                  setSyncing(false);
                }
              }}
              disabled={syncing}
            >
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Actualiser
            </Button>
          </div>
        </header>

        {user && ongoingMatchRegistration && ongoingMatchRegistration.current_match && (
          <Card className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-emerald-50 shadow-[0_0_35px_rgba(52,211,153,0.25)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Ma partie de tournoi en cours</h2>
                <p className="text-sm text-emerald-100/80">
                  {ongoingMatchRegistration.current_match.status === "pending"
                    ? "Nous attendons qu'un adversaire rejoigne votre table."
                    : "Votre adversaire est connecté, il est temps de lancer la partie !"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-100/70">
                  <Badge variant="outline" className="border-emerald-300/40 bg-emerald-500/20 text-emerald-100">
                    Table {ongoingMatchRegistration.current_match.table_number ?? "-"}
                  </Badge>
                  <Badge variant="outline" className="border-emerald-300/40 bg-emerald-500/20 text-emerald-100">
                    {ongoingMatchTournament?.name ?? "Tournoi"}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ongoingMatchRegistration.current_match.status === "in_progress" && (
                  <>
                    <Button
                      size="sm"
                      className="rounded-xl bg-emerald-400 text-black hover:bg-emerald-300"
                      onClick={() =>
                        void handleReportMatch(
                          ongoingMatchRegistration.current_match!.id,
                          ongoingMatchRegistration.current_match!.player1_id === user.id ? "player1" : "player2",
                        )
                      }
                      disabled={reportingMatchId === ongoingMatchRegistration.current_match.id}
                    >
                      {reportingMatchId === ongoingMatchRegistration.current_match.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Je gagne
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/20"
                      onClick={() =>
                        void handleReportMatch(
                          ongoingMatchRegistration.current_match!.id,
                          ongoingMatchRegistration.current_match!.player1_id === user.id ? "player2" : "player1",
                        )
                      }
                      disabled={reportingMatchId === ongoingMatchRegistration.current_match.id}
                    >
                      {reportingMatchId === ongoingMatchRegistration.current_match.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Je perds
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/20"
                      onClick={() =>
                        void handleReportMatch(ongoingMatchRegistration.current_match!.id, "draw")
                      }
                      disabled={reportingMatchId === ongoingMatchRegistration.current_match.id}
                    >
                      {reportingMatchId === ongoingMatchRegistration.current_match.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Partie nulle
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/20"
                  onClick={() =>
                    toast({
                      title: "Lancez votre partie",
                      description: "Rendez-vous dans la salle multijoueur correspondante pour commencer la partie.",
                    })
                  }
                >
                  Ouvrir la salle
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as TournamentTab)} className="space-y-6">
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
                  {tab.tournaments.length}
                </span>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabConfig.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6 space-y-4">
              {tab.tournaments.map(tournament => {
                const registration = registrationByTournament.get(tournament.id);
                const isUserRegistered = Boolean(registration);
                const isLoadingJoin = joiningTournamentId === tournament.id;
                const isLoadingRegister = registeringTournamentId === tournament.id;
                const canJoin = isUserRegistered && new Date(tournament.start_time).getTime() <= Date.now();
                const Icon = tournament.status === "completed" ? Swords : Trophy;

                return (
                  <Card
                    key={tournament.id}
                    className="flex flex-col gap-4 rounded-2xl border border-cyan-400/20 bg-black/50 p-5 shadow-[0_0_25px_rgba(34,211,238,0.2)] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10">
                          <Icon className="h-5 w-5 text-cyan-200" />
                        </span>
                        <div>
                          <p className="text-lg font-semibold text-white">{tournament.name}</p>
                          <p className="text-xs uppercase tracking-wide text-cyan-100/60">
                            Variante : {tournament.variant_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-cyan-100/70">
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-4 w-4 text-cyan-300" /> Début : {formatDateTime(tournament.start_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-4 w-4 text-amber-300" /> Fin : {formatDateTime(tournament.end_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Swords className="h-4 w-4 text-fuchsia-300" /> {computeTimeInfo(tournament)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-3 md:items-end">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full border-cyan-500/40 text-cyan-100">
                          {tournament.player_count} joueurs
                        </Badge>
                        <TournamentStatusBadge tournament={tournament} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="rounded-xl border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
                          onClick={() => handleOpenDetails(tournament.id)}
                        >
                          Voir le classement
                        </Button>
                        {isUserRegistered ? (
                          <Badge className="rounded-xl bg-emerald-500/20 text-emerald-100">Inscrit</Badge>
                        ) : (
                          <Button
                            className="rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 px-6 text-black shadow-[0_0_30px_rgba(34,211,238,0.35)]"
                            onClick={() => void handleRegister(tournament)}
                            disabled={isLoadingRegister}
                          >
                            {isLoadingRegister ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            S'inscrire
                          </Button>
                        )}
                        {canJoin && (
                          <Button
                            variant="outline"
                            className="rounded-xl border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/10"
                            onClick={() => void handleJoinMatch(tournament.id)}
                            disabled={isLoadingJoin}
                          >
                            {isLoadingJoin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Participer maintenant
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}

              {tab.tournaments.length === 0 && (
                <Card className="rounded-2xl border border-cyan-400/20 bg-black/40 p-10 text-center text-cyan-100/70">
                  Aucun tournoi dans cette catégorie pour le moment.
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <Dialog open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
        <DialogContent className="max-w-3xl border-cyan-400/40 bg-black/90 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {selectedTournament?.name ?? "Tournoi"}
            </DialogTitle>
            <DialogDescription className="text-sm text-cyan-100/70">
              Classement mis à jour automatiquement à la fin de chaque match.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {selectedTournament ? (
              <div className="grid gap-3 text-xs text-cyan-100/70 md:grid-cols-3">
                <div className="rounded-xl border border-cyan-500/30 bg-black/40 p-4">
                  <p className="text-cyan-200/80">Fenêtre</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatDateTime(selectedTournament.start_time)} → {formatDateTime(selectedTournament.end_time)}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-500/30 bg-black/40 p-4">
                  <p className="text-cyan-200/80">Participants</p>
                  <p className="mt-1 text-sm font-semibold text-white">{selectedTournament.player_count}</p>
                </div>
                <div className="rounded-xl border border-cyan-500/30 bg-black/40 p-4">
                  <p className="text-cyan-200/80">Matches disputés</p>
                  <p className="mt-1 text-sm font-semibold text-white">{selectedTournament.completed_match_count}</p>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Classement</h3>
                {leaderboardState.loading && <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />}
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-cyan-500/30">
                    <TableHead className="text-cyan-200/80">#</TableHead>
                    <TableHead className="text-cyan-200/80">Joueur</TableHead>
                    <TableHead className="text-cyan-200/80 text-center">Pts</TableHead>
                    <TableHead className="text-cyan-200/80 text-center">G</TableHead>
                    <TableHead className="text-cyan-200/80 text-center">N</TableHead>
                    <TableHead className="text-cyan-200/80 text-center">P</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboardState.entries.length === 0 && !leaderboardState.loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-cyan-100/70">
                        Aucun résultat enregistré pour le moment.
                      </TableCell>
                    </TableRow>
                  ) : (
                    leaderboardState.entries.map((entry, index) => (
                      <TableRow key={`${entry.user_id}-${index}`} className="border-cyan-500/10">
                        <TableCell className="text-cyan-100/80">{index + 1}</TableCell>
                        <TableCell className="text-white">{entry.display_name ?? entry.user_id}</TableCell>
                        <TableCell className="text-center text-cyan-100/80">{entry.points.toFixed(1)}</TableCell>
                        <TableCell className="text-center text-emerald-200">{entry.wins}</TableCell>
                        <TableCell className="text-center text-amber-200">{entry.draws}</TableCell>
                        <TableCell className="text-center text-rose-200">{entry.losses}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {selectedDetailsQuery.isLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-cyan-500/20 bg-black/40 p-6 text-cyan-100/70">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement des matches en cours...
              </div>
            ) : selectedDetailsQuery.data?.matches.length ? (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Matches récents</h3>
                <div className="grid gap-3">
                  {selectedDetailsQuery.data.matches.slice(0, 5).map(match => (
                    <div
                      key={match.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-black/40 p-4 text-sm text-cyan-100/80"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-100">
                          Table {match.table_number ?? "-"}
                        </Badge>
                        <span>ID : {match.id.slice(0, 8)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge
                          className={
                            match.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-100"
                              : "bg-cyan-500/20 text-cyan-100"
                          }
                        >
                          {match.status === "completed" ? "Terminé" : match.status === "in_progress" ? "En cours" : "En attente"}
                        </Badge>
                        {match.result && (
                          <Badge className="bg-fuchsia-500/20 text-fuchsia-100">Résultat : {match.result}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-500/20 bg-black/40 p-4 text-center text-sm text-cyan-100/70">
                Aucun match n'a encore été disputé pour ce tournoi.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TournamentPage;
