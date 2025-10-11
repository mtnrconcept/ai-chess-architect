import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Loader2, RefreshCw, Trophy, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  TournamentFeatureUnavailableError,
  fetchTournamentLeaderboard,
  fetchTournamentOverview,
  fetchUserTournamentRegistrations,
  registerForTournament,
  syncTournaments,
} from "@/lib/tournamentApi";
import type { TournamentLeaderboardEntry, TournamentOverview } from "@/types/tournament";

const statusLabels: Record<TournamentOverview["status"], string> = {
  scheduled: "Planifié",
  running: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};

const statusStyles: Record<TournamentOverview["status"], string> = {
  scheduled: "bg-sky-500/20 text-sky-100 border-sky-400/40",
  running: "bg-emerald-500/20 text-emerald-100 border-emerald-400/40",
  completed: "bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-400/40",
  cancelled: "bg-rose-500/20 text-rose-100 border-rose-400/40",
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatDuration = (start: string, end: string) => {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return "Durée inconnue";
  }

  const diffMs = endTime - startTime;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.round((diffMs % 3600000) / 60000);
  if (minutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
};

const computeTimeMessage = (tournament: TournamentOverview, now: number) => {
  if (tournament.status === "cancelled") {
    return "Tournoi annulé";
  }

  const start = new Date(tournament.start_time).getTime();
  const end = new Date(tournament.end_time).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "Dates à confirmer";
  }

  if (now < start) {
    const minutes = Math.max(1, Math.ceil((start - now) / 60000));
    return `Commence dans ${minutes} min`;
  }

  if (now < end && tournament.status !== "completed") {
    const minutes = Math.max(1, Math.ceil((end - now) / 60000));
    return `Se termine dans ${minutes} min`;
  }

  return `Terminé le ${formatDate(tournament.end_time)}`;
};

interface RankedLeaderboardEntry extends TournamentLeaderboardEntry {
  rank: number;
}

const TournamentLeaderboard = ({ entries }: { entries: RankedLeaderboardEntry[] }) => {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/20 p-4 text-center text-sm text-white/70">
        Aucun résultat enregistré pour le moment.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/10">
          <TableHead className="w-12 text-white/70">#</TableHead>
          <TableHead className="text-white/70">Joueur</TableHead>
          <TableHead className="text-center text-white/70">Pts</TableHead>
          <TableHead className="text-center text-white/70">G</TableHead>
          <TableHead className="text-center text-white/70">N</TableHead>
          <TableHead className="text-center text-white/70">P</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(entry => (
          <TableRow key={entry.user_id} className="border-white/5">
            <TableCell className="text-white/80">{entry.rank}</TableCell>
            <TableCell className="font-medium text-white">{entry.display_name ?? "Joueur mystère"}</TableCell>
            <TableCell className="text-center text-white/90">{entry.points.toFixed(1)}</TableCell>
            <TableCell className="text-center text-emerald-200">{entry.wins}</TableCell>
            <TableCell className="text-center text-amber-200">{entry.draws}</TableCell>
            <TableCell className="text-center text-rose-200">{entry.losses}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

interface TournamentCardProps {
  overview: TournamentOverview;
  leaderboard?: TournamentLeaderboardEntry[];
  leaderboardError?: string | null;
  now: number;
  isRegistered: boolean;
  canRegister: boolean;
  onRegister: () => Promise<void>;
  registering: boolean;
  requiresAuth: boolean;
}

const TournamentCard = ({
  overview,
  leaderboard,
  leaderboardError,
  now,
  isRegistered,
  canRegister,
  onRegister,
  registering,
  requiresAuth,
}: TournamentCardProps) => {
  const limitedLeaderboard = useMemo<RankedLeaderboardEntry[]>(
    () =>
      (leaderboard ?? []).map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }))
        .slice(0, 10),
    [leaderboard],
  );
  const isCompleted = overview.status === "completed";
  const isCancelled = overview.status === "cancelled";
  const ruleChips = useMemo(() => overview.variant_rules ?? [], [overview.variant_rules]);

  const renderRegistrationArea = () => {
    if (isRegistered) {
      return (
        <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
          Vous participez à ce tournoi
        </Badge>
      );
    }

    if (requiresAuth) {
      return (
        <Button variant="outline" className="border-white/30 text-white" asChild>
          <Link to="/signup">Connectez-vous pour participer</Link>
        </Button>
      );
    }

    if (!canRegister) {
      return (
        <Badge variant="outline" className="border-white/20 bg-white/5 text-white/70">
          Inscriptions closes
        </Badge>
      );
    }

    return (
      <Button onClick={onRegister} disabled={registering} className="bg-emerald-500 text-black hover:bg-emerald-400">
        {registering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
        S&apos;inscrire au tournoi
      </Button>
    );
  };

  return (
    <Card className="border-white/10 bg-gradient-to-br from-black/70 via-slate-900/60 to-slate-900/30 text-white shadow-lg">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-semibold text-white">{overview.name}</CardTitle>
            <p className="mt-1 text-sm text-white/70">
              Variante <span className="font-medium text-white">{overview.variant_name}</span>
              {overview.variant_source ? (
                <span className="text-white/50"> · Source {overview.variant_source}</span>
              ) : null}
            </p>
            {overview.description ? (
              <p className="mt-2 text-sm text-white/60">{overview.description}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className={`${statusStyles[overview.status]} px-3 py-1 text-xs font-semibold`}>
              {statusLabels[overview.status]}
            </Badge>
            {isRegistered ? (
              <Badge variant="outline" className="border-emerald-400/50 bg-emerald-500/10 text-emerald-100">
                Inscrit
              </Badge>
            ) : null}
          </div>
        </div>

        {ruleChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ruleChips.map(rule => (
              <Badge key={rule} variant="outline" className="border-white/20 bg-white/5 text-xs text-white/80">
                {rule}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <CalendarClock className="h-4 w-4" />
              Début
            </div>
            <p className="mt-1 text-white">{formatDate(overview.start_time)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <CalendarClock className="h-4 w-4" />
              Fin
            </div>
            <p className="mt-1 text-white">{formatDate(overview.end_time)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <Trophy className="h-4 w-4" />
              Durée
            </div>
            <p className="mt-1 text-white">{formatDuration(overview.start_time, overview.end_time)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/50">Statut</p>
            <p className="mt-1 text-base font-semibold text-white">{computeTimeMessage(overview, now)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/50">Participants</p>
            <p className="mt-1 text-base font-semibold text-white flex items-center gap-1">
              <Users className="h-4 w-4" /> {overview.player_count}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/50">Matches</p>
            <p className="mt-1 text-base font-semibold text-white">
              {overview.completed_match_count} terminés · {overview.active_match_count} en cours
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">{renderRegistrationArea()}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Trophy className="h-5 w-5 text-amber-300" /> {isCompleted ? "Classement final" : "Classement provisoire"}
          </h3>
          {!isCompleted && !isCancelled ? (
            <span className="text-xs uppercase tracking-wide text-white/50">
              Mise à jour en continu, classement final à la fin du tournoi
            </span>
          ) : null}
        </div>
        {leaderboardError ? (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {leaderboardError}
          </div>
        ) : leaderboard ? (
          <TournamentLeaderboard entries={limitedLeaderboard} />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-white/10 bg-black/40 p-6 text-white/80">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Classement en cours de chargement...
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const TournamentPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tournaments, setTournaments] = useState<TournamentOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [leaderboards, setLeaderboards] = useState<Record<string, TournamentLeaderboardEntry[] | undefined>>({});
  const [leaderboardErrors, setLeaderboardErrors] = useState<Record<string, string | null>>({});
  const [userRegistrations, setUserRegistrations] = useState<Record<string, boolean>>({});
  const [registeringIds, setRegisteringIds] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTournamentOverview();
      setTournaments(data);
      setLeaderboards({});
      setLeaderboardErrors({});
    } catch (err) {
      if (err instanceof TournamentFeatureUnavailableError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Impossible de charger les tournois");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLeaderboards = useCallback(async (tournamentsToLoad: TournamentOverview[]) => {
    if (tournamentsToLoad.length === 0) {
      return;
    }

    const ids = tournamentsToLoad.map(t => t.id);

    const results = await Promise.allSettled(
      ids.map(async id => {
        try {
          const data = await fetchTournamentLeaderboard(id);
          return { id, data };
        } catch (error) {
          throw { id, error };
        }
      }),
    );

    const nextLeaderboards: Record<string, TournamentLeaderboardEntry[] | undefined> = {};
    const nextErrors: Record<string, string | null> = {};

    results.forEach(result => {
      if (result.status === "fulfilled") {
        nextLeaderboards[result.value.id] = result.value.data;
        nextErrors[result.value.id] = null;
      } else {
        const reason = result.reason as { id: string; error: unknown };
        const targetId = reason?.id ?? "unknown";
        const underlyingError = reason?.error;

        if (underlyingError instanceof TournamentFeatureUnavailableError) {
          nextErrors[targetId] = underlyingError.message;
        } else if (underlyingError instanceof Error) {
          nextErrors[targetId] = underlyingError.message;
        } else {
          nextErrors[targetId] = "Classement indisponible";
        }
      }
    });

    setLeaderboards(prev => ({ ...prev, ...nextLeaderboards }));
    setLeaderboardErrors(prev => ({ ...prev, ...nextErrors }));
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    if (tournaments.length === 0) {
      return;
    }

    loadLeaderboards(tournaments);
  }, [tournaments, loadLeaderboards]);

  useEffect(() => {
    let isMounted = true;

    const loadRegistrations = async () => {
      if (!user) {
        if (isMounted) {
          setUserRegistrations({});
        }
        return;
      }

      try {
        const registrations = await fetchUserTournamentRegistrations(user.id);
        if (!isMounted) return;
        const mapping = registrations.reduce<Record<string, boolean>>((acc, registration) => {
          acc[registration.tournament_id] = true;
          return acc;
        }, {});
        setUserRegistrations(mapping);
      } catch (err) {
        const message =
          err instanceof TournamentFeatureUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Impossible de charger vos inscriptions";
        if (isMounted) {
          toast({
            title: "Inscriptions indisponibles",
            description: message,
            variant: "destructive",
          });
        }
      }
    };

    loadRegistrations();

    return () => {
      isMounted = false;
    };
  }, [user, toast]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    loadTournaments();
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncTournaments();
      await loadTournaments();
    } catch (err) {
      if (err instanceof TournamentFeatureUnavailableError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Impossible de synchroniser les tournois");
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleRegister = useCallback(
    async (tournament: TournamentOverview) => {
      if (!user) {
        toast({
          title: "Connexion requise",
          description: "Identifiez-vous pour participer aux tournois.",
        });
        return;
      }

      setRegisteringIds(prev => ({ ...prev, [tournament.id]: true }));

      const metadata = user.user_metadata ?? {};
      const displayName =
        (metadata.full_name as string | undefined) ||
        (metadata.display_name as string | undefined) ||
        (metadata.username as string | undefined) ||
        user.email?.split("@")[0] ||
        "Joueur";
      const avatarUrl =
        (metadata.avatar_url as string | undefined) ||
        (metadata.picture as string | undefined) ||
        (metadata.avatarUrl as string | undefined) ||
        null;

      try {
        await registerForTournament(tournament.id, user.id, displayName, avatarUrl);
        setUserRegistrations(prev => ({ ...prev, [tournament.id]: true }));
        setTournaments(prev =>
          prev.map(item =>
            item.id === tournament.id
              ? {
                  ...item,
                  player_count: item.player_count + 1,
                }
              : item,
          ),
        );
        toast({
          title: "Inscription confirmée",
          description: `Vous participez maintenant à ${tournament.name}.`,
        });
      } catch (err) {
        const message =
          err instanceof TournamentFeatureUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Impossible de vous inscrire";
        toast({
          title: "Inscription refusée",
          description: message,
          variant: "destructive",
        });
      } finally {
        setRegisteringIds(prev => ({ ...prev, [tournament.id]: false }));
      }
    },
    [toast, user],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 text-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Tournois automatiques</h1>
          <p className="text-sm text-white/70">
            Participez à des tournois générés à partir des variantes réelles de la communauté et suivez les classements en
            direct.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="border-white/30 text-white" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualiser
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="bg-emerald-500 text-black hover:bg-emerald-400"
          >
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
            Synchroniser avec Supabase
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-white/10 bg-black/40 p-8 text-white/80">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement des tournois...
        </div>
      ) : tournaments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/20 bg-black/30 p-8 text-center text-sm text-white/70">
          Aucun tournoi n&apos;est disponible pour le moment. Synchronisez les données ou revenez plus tard.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {tournaments.map(tournament => (
            <TournamentCard
              key={tournament.id}
              overview={tournament}
              leaderboard={leaderboards[tournament.id]}
              leaderboardError={leaderboardErrors[tournament.id] ?? undefined}
              now={now}
              isRegistered={Boolean(userRegistrations[tournament.id])}
              canRegister={tournament.status !== "completed" && tournament.status !== "cancelled"}
              onRegister={() => handleRegister(tournament)}
              registering={Boolean(registeringIds[tournament.id])}
              requiresAuth={!user}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TournamentPage;
