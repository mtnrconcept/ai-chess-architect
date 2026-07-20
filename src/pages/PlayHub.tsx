import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Gamepad2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

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
import NeonBackground from "@/components/layout/NeonBackground";
import { useAuth } from "@/contexts/AuthContext";
import { LiveRuleLobbiesCard } from "@/features/play-hub/LiveRuleLobbiesCard";
import { PrivateRoomCard } from "@/features/play-hub/PrivateRoomCard";
import { ProgressionCard } from "@/features/play-hub/ProgressionCard";
import { QuickPlayPanel } from "@/features/play-hub/QuickPlayPanel";
import { RuleArchitectSpotlight } from "@/features/play-hub/RuleArchitectSpotlight";
import { ServerDailyPuzzleCard } from "@/features/play-hub/ServerDailyPuzzleCard";
import { StandardRoomsCard } from "@/features/play-hub/StandardRoomsCard";
import { toLocalDateKey } from "@/features/play-hub/daily-puzzles";
import {
  getServerDailyPuzzle,
  getServerPlayerProgress,
} from "@/features/play-hub/platform-api";
import {
  readLocalProgress,
  type LocalPlayerProgress,
} from "@/features/play-hub/progression";

const resolveDisplayName = (
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null,
): string => {
  if (!user) return "Joueur";
  const metadata = user.user_metadata ?? {};
  const candidate = ["display_name", "full_name", "name", "username"]
    .map((key) => metadata[key])
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
  return candidate?.trim() ?? user.email?.split("@")[0] ?? "Joueur";
};

export default function PlayHub() {
  const { user, loading: authLoading } = useAuth();
  const [progress] = useState<LocalPlayerProgress>(() => readLocalProgress());
  const displayName = useMemo(() => resolveDisplayName(user), [user]);
  const [puzzleDate, setPuzzleDate] = useState(() =>
    toLocalDateKey(new Date()),
  );
  const puzzleQuery = useQuery({
    queryKey: ["chess-platform", "daily-puzzle", puzzleDate, user?.id],
    queryFn: () => getServerDailyPuzzle(puzzleDate),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: 1,
  });
  const serverProgressQuery = useQuery({
    queryKey: ["chess-platform", "player-progress", user?.id],
    queryFn: () => getServerPlayerProgress(user!.id),
    enabled: Boolean(user),
    staleTime: 15_000,
    retry: 1,
  });
  const serverProgress = useMemo<LocalPlayerProgress>(() => {
    const data = serverProgressQuery.data;
    return {
      xp: data?.totalXp ?? 0,
      puzzlesSolved: data?.puzzlesSolved ?? 0,
      currentStreak: data?.currentStreak ?? 0,
      bestStreak: data?.bestStreak ?? 0,
      lastPuzzleDate: data?.lastActivityOn ?? null,
      completedPuzzleIds: [],
    };
  }, [serverProgressQuery.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPuzzleDate((current) => {
        const next = toLocalDateKey(new Date());
        return next === current ? current : next;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshServerPuzzleState = async () => {
    const [puzzleResult] = await Promise.all([
      puzzleQuery.refetch(),
      serverProgressQuery.refetch(),
    ]);
    if (puzzleResult.error) throw puzzleResult.error;
  };

  return (
    <NeonBackground>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/30 px-5 py-7 shadow-[0_35px_120px_-70px_rgba(34,211,238,0.95)] backdrop-blur-xl sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-fuchsia-400/15 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl space-y-4">
              <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                <Gamepad2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Hub Jouer
              </Badge>
              <div>
                <p className="text-sm font-medium text-cyan-100/55">
                  {authLoading
                    ? "Chargement du profil…"
                    : `Prêt, ${displayName} ?`}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
                  Une partie, un défi ou une règle impossible
                </h1>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">
                Entraînement instantané, matchmaking, invitations privées et
                problème quotidien dans un seul espace. Le moteur Rule Architect
                reste le cœur différenciant de chaque partie personnalisée.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Règles V2 validées côté serveur</span>
            </div>
          </div>
        </header>

        {authLoading ? (
          <section
            aria-label="Chargement du hub"
            className="grid gap-6 lg:grid-cols-3"
          >
            <Skeleton className="h-[430px] bg-white/10 lg:col-span-2" />
            <Skeleton className="h-[430px] bg-white/10" />
          </section>
        ) : (
          <>
            <section aria-labelledby="play-now-title" className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Sparkles
                  className="h-4 w-4 text-cyan-300"
                  aria-hidden="true"
                />
                <h2
                  id="play-now-title"
                  className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-100/65"
                >
                  Entrer dans l'arène
                </h2>
              </div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
                <QuickPlayPanel
                  isAuthenticated={Boolean(user)}
                  playerName={displayName}
                  userId={user?.id}
                />
                {!user ? (
                  <ProgressionCard progress={progress} source="local" />
                ) : serverProgressQuery.isLoading ? (
                  <Skeleton className="min-h-[360px] bg-white/10" />
                ) : serverProgressQuery.isError ? (
                  <div className="space-y-3">
                    <Alert className="border-amber-300/25 bg-amber-300/10 text-amber-50">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      <AlertTitle>Progression hors-ligne</AlertTitle>
                      <AlertDescription>
                        <p>
                          La progression serveur est indisponible. Les valeurs
                          affichées ci-dessous appartiennent uniquement à cet
                          appareil.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => void serverProgressQuery.refetch()}
                        >
                          <RefreshCw
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Réessayer la synchronisation
                        </Button>
                      </AlertDescription>
                    </Alert>
                    <ProgressionCard progress={progress} source="local" />
                  </div>
                ) : (
                  <ProgressionCard
                    progress={serverProgress}
                    source="server"
                    serverLevel={serverProgressQuery.data?.level ?? 1}
                  />
                )}
              </div>
            </section>

            <section aria-label="Puzzle du jour">
              {!user ? (
                <Card className="border-amber-300/20 bg-[#0b0a18]/90">
                  <CardHeader>
                    <CardTitle>Problème du jour sécurisé</CardTitle>
                    <CardDescription>
                      Connecte-toi pour charger le FEN public et faire valider
                      chaque coup exclusivement par le serveur. Aucune solution
                      de secours n’est embarquée dans le navigateur.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild>
                      <Link to="/signup">Se connecter pour résoudre</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : puzzleQuery.isLoading ? (
                <Skeleton className="h-[520px] bg-white/10" />
              ) : puzzleQuery.isError ? (
                <Alert className="border-amber-300/25 bg-amber-300/10 text-amber-50">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <AlertTitle>Puzzle serveur indisponible</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      Le défi reste fermé : aucune solution locale ou réponse de
                      remplacement n’est chargée dans le navigateur.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void puzzleQuery.refetch()}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Réessayer le serveur
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : !puzzleQuery.data?.available ? (
                <Card className="border-white/10 bg-black/35 text-center">
                  <CardHeader>
                    <CardTitle>Aucun puzzle publié aujourd’hui</CardTitle>
                    <CardDescription>
                      Le serveur n’a retourné aucun problème pour le{" "}
                      {puzzleDate}. Aucun puzzle fictif n’est substitué à cet
                      état vide.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      onClick={() => void puzzleQuery.refetch()}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Actualiser
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <ServerDailyPuzzleCard
                  key={puzzleQuery.data.puzzleId ?? puzzleDate}
                  puzzle={puzzleQuery.data}
                  onServerStateChanged={refreshServerPuzzleState}
                />
              )}
            </section>

            <section aria-labelledby="multiplayer-title" className="space-y-3">
              <h2
                id="multiplayer-title"
                className="px-1 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-100/65"
              >
                Multijoueur et salles
              </h2>
              <StandardRoomsCard
                isAuthenticated={Boolean(user)}
                playerName={displayName}
                userId={user?.id}
              />
              <div className="space-y-3 pt-3">
                <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-100/60">
                  Règles personnalisées · Rule Architect
                </h3>
                <div className="grid gap-6 lg:grid-cols-2">
                  <PrivateRoomCard />
                  <LiveRuleLobbiesCard isAuthenticated={Boolean(user)} />
                </div>
              </div>
            </section>

            <section aria-label="Créer une règle personnalisée">
              <RuleArchitectSpotlight />
            </section>
          </>
        )}
      </div>
    </NeonBackground>
  );
}
