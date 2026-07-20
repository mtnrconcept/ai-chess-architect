import {
  AlertCircle,
  Crown,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import NeonBackground from "@/components/layout/NeonBackground";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import {
  getChessLeaderboard,
  neutralPlayerLabel,
  type ChessLeaderboardEntry,
} from "@/features/play-hub/platform-api";
import { cn } from "@/lib/utils";

const winRate = (entry: ChessLeaderboardEntry): string =>
  entry.gamesPlayed === 0
    ? "—"
    : `${Math.round((entry.wins / entry.gamesPlayed) * 100)} %`;

const podiumTone = (rank: number): string => {
  if (rank === 1) return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  if (rank === 2) return "border-slate-200/30 bg-slate-200/10 text-slate-100";
  if (rank === 3)
    return "border-orange-300/30 bg-orange-300/10 text-orange-100";
  return "border-cyan-300/20 bg-cyan-300/5 text-cyan-100";
};

function PlayerIdentity({
  entry,
  isCurrentUser,
}: {
  entry: ChessLeaderboardEntry;
  isCurrentUser: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
          podiumTone(entry.rank),
        )}
      >
        {entry.rank <= 3 ? (
          <Crown className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Users className="h-5 w-5" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-white">
            {neutralPlayerLabel(entry.userId)}
          </span>
          {isCurrentUser && (
            <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              Vous
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-white/40">
          {entry.provisional ? "Classement provisoire" : "Classement établi"}
        </p>
      </div>
    </div>
  );
}

function MobileLeaderboardCard({
  entry,
  isCurrentUser,
}: {
  entry: ChessLeaderboardEntry;
  isCurrentUser: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-2xl border bg-black/25 p-4",
        isCurrentUser ? "border-cyan-300/45" : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PlayerIdentity entry={entry} isCurrentUser={isCurrentUser} />
        <span className="font-mono text-lg font-bold text-cyan-100">
          #{entry.rank}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-white/35">
            Elo
          </dt>
          <dd className="mt-1 font-mono font-semibold text-cyan-100">
            {entry.rating}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-white/35">
            Parties
          </dt>
          <dd className="mt-1 font-mono font-semibold">{entry.gamesPlayed}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-white/35">
            Victoires
          </dt>
          <dd className="mt-1 font-mono font-semibold text-emerald-200">
            {entry.wins}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-white/35">
            Ratio
          </dt>
          <dd className="mt-1 font-mono font-semibold">{winRate(entry)}</dd>
        </div>
      </dl>
    </li>
  );
}

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth();
  const leaderboardQuery = useQuery<ChessLeaderboardEntry[], Error>({
    queryKey: ["chess-platform", "leaderboard", "current-season"],
    queryFn: () => getChessLeaderboard(100),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: 1,
  });

  return (
    <NeonBackground>
      <div className="mx-auto min-h-[80vh] w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative space-y-4">
            <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              <Trophy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Classement officiel
            </Badge>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Classement de la saison
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cyan-100/60 sm:text-base">
                Résultats issus directement des parties classées validées par le
                serveur. La saison active, ou la dernière saison terminée, est
                sélectionnée automatiquement.
              </p>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Aucune donnée de démonstration
            </div>
          </div>
        </header>

        {authLoading ? (
          <section aria-label="Chargement du classement" className="space-y-3">
            <Skeleton className="h-20 bg-white/10" />
            <Skeleton className="h-20 bg-white/10" />
            <Skeleton className="h-20 bg-white/10" />
          </section>
        ) : !user ? (
          <Card className="border-cyan-300/20 bg-black/35">
            <CardHeader>
              <CardTitle>Connexion requise</CardTitle>
              <CardDescription>
                Le classement officiel est réservé aux joueurs authentifiés.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/signup">Connexion ou inscription</Link>
              </Button>
            </CardContent>
          </Card>
        ) : leaderboardQuery.isLoading ? (
          <section aria-label="Chargement du classement" className="space-y-3">
            {["rank-1", "rank-2", "rank-3", "rank-4"].map((key) => (
              <Skeleton key={key} className="h-20 bg-white/10" />
            ))}
          </section>
        ) : leaderboardQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Classement indisponible</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{leaderboardQuery.error.message}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void leaderboardQuery.refetch()}
                disabled={leaderboardQuery.isFetching}
              >
                {leaderboardQuery.isFetching ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        ) : (leaderboardQuery.data ?? []).length === 0 ? (
          <Card className="border-white/10 bg-black/35 text-center">
            <CardHeader>
              <CardTitle>Aucun joueur classé</CardTitle>
              <CardDescription>
                Aucune saison active avec des résultats classés n’est disponible
                pour le moment. Le classement apparaîtra après les premières
                parties validées.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/play-hub">Retour au hub Jouer</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section aria-label="Joueurs classés">
            <div className="mb-3 flex items-center justify-between gap-3 px-1 text-xs text-white/45">
              <span>
                {leaderboardQuery.data?.length ?? 0} joueur(s) classé(s)
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void leaderboardQuery.refetch()}
                disabled={leaderboardQuery.isFetching}
                className="text-cyan-100/70 hover:text-white"
              >
                <RefreshCw
                  className={cn(
                    "mr-2 h-3.5 w-3.5",
                    leaderboardQuery.isFetching && "animate-spin",
                  )}
                  aria-hidden="true"
                />
                Actualiser
              </Button>
            </div>

            <ul className="space-y-3 md:hidden">
              {leaderboardQuery.data?.map((entry) => (
                <MobileLeaderboardCard
                  key={entry.userId}
                  entry={entry}
                  isCurrentUser={entry.userId === user.id}
                />
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur-xl md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-20">Rang</TableHead>
                    <TableHead>Joueur</TableHead>
                    <TableHead className="text-center">Elo</TableHead>
                    <TableHead className="text-center">Parties</TableHead>
                    <TableHead className="text-center">V / N / D</TableHead>
                    <TableHead className="text-right">Victoires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboardQuery.data?.map((entry) => {
                    const isCurrentUser = entry.userId === user.id;
                    return (
                      <TableRow
                        key={entry.userId}
                        className={cn(
                          "border-white/5",
                          isCurrentUser && "bg-cyan-300/[0.07]",
                        )}
                      >
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex min-w-10 justify-center rounded-full border px-2 py-1 font-mono text-sm font-bold",
                              podiumTone(entry.rank),
                            )}
                          >
                            {entry.rank}
                          </span>
                        </TableCell>
                        <TableCell>
                          <PlayerIdentity
                            entry={entry}
                            isCurrentUser={isCurrentUser}
                          />
                        </TableCell>
                        <TableCell className="text-center font-mono text-base font-bold text-cyan-100">
                          {entry.rating}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {entry.gamesPlayed}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          <span className="text-emerald-200">{entry.wins}</span>
                          <span className="text-white/30"> / </span>
                          <span>{entry.draws}</span>
                          <span className="text-white/30"> / </span>
                          <span className="text-rose-200">{entry.losses}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {winRate(entry)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>
    </NeonBackground>
  );
}
