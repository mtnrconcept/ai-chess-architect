import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, Trophy, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TournamentLeaderboardEntry, TournamentSummary } from "@/models/Tournament";
import { fetchTournaments, seedTournaments } from "@/lib/localTournamentClient";

const statusLabels: Record<TournamentSummary["status"], string> = {
  scheduled: "Planifié",
  ongoing: "En cours",
  completed: "Terminé",
};

const statusStyles: Record<TournamentSummary["status"], string> = {
  scheduled: "bg-sky-500/20 text-sky-100 border-sky-400/40",
  ongoing: "bg-emerald-500/20 text-emerald-100 border-emerald-400/40",
  completed: "bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-400/40",
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatDuration = (start: string, end: string) => {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.round((diffMs % 3600000) / 60000);
  if (minutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
};

const computeTimeMessage = (tournament: TournamentSummary, now: number) => {
  const start = new Date(tournament.startTime).getTime();
  const end = new Date(tournament.endTime).getTime();

  if (now < start) {
    const minutes = Math.max(1, Math.ceil((start - now) / 60000));
    return `Commence dans ${minutes} min`;
  }

  if (now < end && tournament.status !== "completed") {
    const minutes = Math.max(1, Math.ceil((end - now) / 60000));
    return `Se termine dans ${minutes} min`;
  }

  return `Terminé le ${formatDate(tournament.endTime)}`;
};

const TournamentLeaderboard = ({ entries }: { entries: TournamentLeaderboardEntry[] }) => {
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
          <TableRow key={entry.playerId} className="border-white/5">
            <TableCell className="text-white/80">{entry.rank}</TableCell>
            <TableCell className="font-medium text-white">{entry.playerName}</TableCell>
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

const TournamentCard = ({ tournament, now }: { tournament: TournamentSummary; now: number }) => {
  const leaderboard = useMemo(() => tournament.leaderboard ?? [], [tournament.leaderboard]);
  const isCompleted = tournament.status === "completed";

  return (
    <Card className="border-white/10 bg-gradient-to-br from-black/70 via-slate-900/60 to-slate-900/30 text-white shadow-lg">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-semibold text-white">{tournament.name}</CardTitle>
            <p className="mt-1 text-sm text-white/70">
              Règle <span className="font-medium text-white">{tournament.rule}</span> · Tempo
              <span className="font-medium text-white"> {tournament.timeControl}</span>
            </p>
          </div>
          <Badge variant="outline" className={`${statusStyles[tournament.status]} px-3 py-1 text-xs font-semibold`}>
            {statusLabels[tournament.status]}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <CalendarClock className="h-4 w-4" />
              Début
            </div>
            <p className="mt-1 text-white">{formatDate(tournament.startTime)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <CalendarClock className="h-4 w-4" />
              Fin
            </div>
            <p className="mt-1 text-white">{formatDate(tournament.endTime)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <Trophy className="h-4 w-4" />
              Durée
            </div>
            <p className="mt-1 text-white">{formatDuration(tournament.startTime, tournament.endTime)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/50">Statut</p>
            <p className="mt-1 text-base font-semibold text-white">{computeTimeMessage(tournament, now)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/50">Participants</p>
            <p className="mt-1 text-base font-semibold text-white flex items-center gap-1">
              <Users className="h-4 w-4" /> {tournament.totalPlayers}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/50">Matches</p>
            <p className="mt-1 text-base font-semibold text-white">{tournament.totalMatches}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Trophy className="h-5 w-5 text-amber-300" /> {isCompleted ? "Classement final" : "Classement provisoire"}
          </h3>
          {!isCompleted && (
            <span className="text-xs uppercase tracking-wide text-white/50">
              Mise à jour en continu, classement final à la fin du tournoi
            </span>
          )}
        </div>
        <TournamentLeaderboard entries={leaderboard} />
      </CardContent>
    </Card>
  );
};

const TournamentPage = () => {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTournaments();
      setTournaments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les tournois");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const data = await seedTournaments();
      setTournaments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de créer les tournois");
    } finally {
      setSeeding(false);
    }
  };

  const handleRefresh = () => {
    loadTournaments();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 text-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Tournois automatiques</h1>
          <p className="text-sm text-white/70">
            Dix tournois sont générés automatiquement : chacun dure deux heures, utilise une règle et un tempo aléatoires,
            et attribue un point par victoire.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="border-white/30 text-white" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualiser
          </Button>
          <Button onClick={handleSeed} disabled={seeding} className="bg-emerald-500 text-black hover:bg-emerald-400">
            {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trophy className="mr-2 h-4 w-4" />}
            Recréer 10 tournois
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
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {tournaments.map(tournament => (
            <TournamentCard key={tournament.id} tournament={tournament} now={now} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TournamentPage;
