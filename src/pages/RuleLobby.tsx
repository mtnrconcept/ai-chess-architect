import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Swords,
  UserPlus,
  XCircle,
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
import NeonBackground from "@/components/layout/NeonBackground";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { convertRuleJsonToChessRule } from "@/lib/presetRulesAdapter";
import {
  cancelRuleLobby,
  getRuleLobby,
  getRuleLobbyRuntime,
  joinRuleLobby,
  listRuleLobbies,
  type RuleLobbyDetails,
  type RuleLobbySummary,
} from "@/features/rule-architect/lobby-api";
import { getRuleLobbyLaunchBlockReason } from "@/features/rule-architect/lobby-launch-policy";

const dateLabel = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date inconnue"
    : new Intl.DateTimeFormat("fr-CH", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
};

export default function RuleLobby() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lobbyId = searchParams.get("lobbyId");

  const [lobby, setLobby] = useState<RuleLobbyDetails | null>(null);
  const [waiting, setWaiting] = useState<RuleLobbySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayName = useMemo(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const candidate =
      metadata?.display_name ?? metadata?.full_name ?? metadata?.name;
    return typeof candidate === "string"
      ? candidate
      : (user?.email?.split("@")[0] ?? "Adversaire");
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    setError(null);
    try {
      if (lobbyId) {
        const details = await getRuleLobby(lobbyId);
        setLobby(details);
        setWaiting([]);
        if (!details) {
          setError("Ce lobby n'existe pas ou n'est plus accessible.");
        }
      } else {
        const rows = await listRuleLobbies();
        setWaiting(rows);
        setLobby(null);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible.",
      );
    } finally {
      setLoading(false);
    }
  }, [lobbyId, user]);

  useEffect(() => {
    if (!authLoading) {
      setLoading(true);
      void refresh();
    }
  }, [authLoading, refresh]);

  useEffect(() => {
    if (!user || !lobbyId || lobby?.status === "cancelled") {
      return;
    }

    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [lobby?.status, lobbyId, refresh, user]);

  const handleJoin = async (targetLobbyId: string) => {
    setBusyId(targetLobbyId);
    try {
      await joinRuleLobby(targetLobbyId, displayName);
      toast({
        title: "Lobby rejoint",
        description:
          "Le ruleset et le seed sont maintenant verrouillés pour les deux joueurs.",
      });
      navigate(`/rule-lobby?lobbyId=${encodeURIComponent(targetLobbyId)}`);
    } catch (caught) {
      toast({
        title: "Lobby indisponible",
        description:
          caught instanceof Error
            ? caught.message
            : "Un autre joueur a peut-être rejoint ce lobby.",
        variant: "destructive",
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async () => {
    if (!lobby) return;
    setBusyId(lobby.lobbyId);
    try {
      await cancelRuleLobby(lobby.lobbyId);
      toast({
        title: "Lobby annulé",
      });
      navigate("/rule-lobby");
    } catch (caught) {
      toast({
        title: "Annulation impossible",
        description:
          caught instanceof Error ? caught.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Lien d'invitation copié",
      });
    } catch {
      toast({
        title: "Copie impossible",
        variant: "destructive",
      });
    }
  };

  const launchGame = async () => {
    if (!lobby || !user) return;

    setBusyId(lobby.lobbyId);

    try {
      const runtime = await getRuleLobbyRuntime(lobby.lobbyId);
      const launchBlockReason = getRuleLobbyLaunchBlockReason(runtime.mode);

      if (launchBlockReason) {
        toast({
          title: "Partie multijoueur en attente",
          description: launchBlockReason,
          variant: "destructive",
        });
        return;
      }

      const customRules = runtime.rules.map((entry) =>
        convertRuleJsonToChessRule(entry.ruleJson),
      );

      navigate("/play", {
        state: {
          customRules,
          presetRuleIds: [],
          opponentType: runtime.mode === "ai" ? "ai" : "player",
          role: runtime.creatorId === user.id ? "creator" : "opponent",
          lobbyId: runtime.lobbyId,
          lobbyName: runtime.lobbyName,
          opponentName:
            runtime.opponentName ??
            (runtime.mode === "ai" ? "IA" : "Adversaire"),
          matchStatus: "active",
          ruleArchitectMatchSeed: runtime.matchSeed,
          ruleArchitectRulesetHash: runtime.rulesetHash,
          ruleArchitectEngineVersion: runtime.engineVersion,
        },
      });
    } catch (caught) {
      toast({
        title: "Chargement de la partie impossible",
        description:
          caught instanceof Error
            ? caught.message
            : "Le runtime du lobby est indisponible.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) {
    return (
      <NeonBackground>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </NeonBackground>
    );
  }

  if (!user) {
    return (
      <NeonBackground>
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Connexion requise</CardTitle>
              <CardDescription>
                Les lobbies de règles IA sont réservés aux joueurs connectés.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button asChild>
                <Link to="/signup">Créer un compte</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">Retour</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </NeonBackground>
    );
  }

  return (
    <NeonBackground>
      <div className="mx-auto min-h-[80vh] w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(lobbyId ? "/rule-lobby" : "/generator")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">
                Lobby Rule Architect
              </h1>
              <p className="text-sm text-muted-foreground">
                Versions immuables, matchmaking atomique et seed partagé.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setLoading(true);
              void refresh();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && (
          <Card>
            <CardContent className="flex min-h-48 items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement du lobby…
            </CardContent>
          </Card>
        )}

        {!loading && lobby && (
          <div className="grid gap-6 lg:grid-cols-[1fr_0.75fr]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{lobby.lobbyName}</CardTitle>
                    <CardDescription>
                      Créé le {dateLabel(lobby.createdAt)}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      lobby.status === "matched"
                        ? "default"
                        : lobby.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {lobby.status === "matched"
                      ? "Adversaire trouvé"
                      : lobby.status === "cancelled"
                        ? "Annulé"
                        : "En attente"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Moteur
                    </p>
                    <p className="mt-1 font-semibold">{lobby.engineVersion}</p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Mode
                    </p>
                    <p className="mt-1 font-semibold">
                      {lobby.mode === "ai"
                        ? "Contre l'IA"
                        : "Joueur contre joueur"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Règles verrouillées</p>
                  <div className="flex flex-wrap gap-2">
                    {lobby.legacyRuleIds.map((ruleId) => (
                      <Badge key={ruleId} variant="outline">
                        {ruleId}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Empreinte du ruleset
                  </div>
                  <code className="mt-2 block break-all text-xs text-muted-foreground">
                    {lobby.rulesetHash}
                  </code>
                </div>

                {lobby.isParticipant && lobby.matchSeed !== null && (
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <p className="text-sm font-semibold">Seed déterministe</p>
                    <code className="mt-2 block text-xs text-muted-foreground">
                      {lobby.matchSeed}
                    </code>
                  </div>
                )}

                {lobby.status === "waiting" && lobby.isParticipant && (
                  <div className="flex flex-wrap gap-3">
                    <Button className="gap-2" onClick={copyInvite}>
                      <Copy className="h-4 w-4" />
                      Copier l'invitation
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      disabled={busyId === lobby.lobbyId}
                      onClick={handleCancel}
                    >
                      {busyId === lobby.lobbyId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Annuler
                    </Button>
                  </div>
                )}

                {lobby.status === "waiting" && !lobby.isParticipant && (
                  <Button
                    size="lg"
                    className="w-full gap-2"
                    disabled={busyId === lobby.lobbyId}
                    onClick={() => void handleJoin(lobby.lobbyId)}
                  >
                    {busyId === lobby.lobbyId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Rejoindre ce lobby
                  </Button>
                )}

                {lobby.status === "matched" && lobby.isParticipant && (
                  <div className="space-y-2">
                    {lobby.mode === "player" && (
                      <p
                        role="status"
                        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
                      >
                        Le lancement joueur attend le runtime serveur
                        autoritaire. Ce lobby reste conservé.
                      </p>
                    )}
                    <Button
                      size="lg"
                      className="w-full gap-2"
                      disabled={busyId === lobby.lobbyId}
                      onClick={() => void launchGame()}
                    >
                      {busyId === lobby.lobbyId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Swords className="h-4 w-4" />
                      )}
                      {lobby.mode === "player"
                        ? "Vérifier la disponibilité"
                        : "Lancer la partie"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>État de la connexion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  [
                    true,
                    "Règles publiées",
                    "Les versions ne peuvent plus être modifiées.",
                  ],
                  [
                    true,
                    "Ruleset signé",
                    "Les deux joueurs chargent la même empreinte.",
                  ],
                  [
                    lobby.status === "matched",
                    "Adversaire",
                    lobby.status === "matched"
                      ? (lobby.opponentName ?? "Adversaire connecté")
                      : "En attente d'un second joueur.",
                  ],
                ].map(([done, title, text]) => (
                  <div
                    key={String(title)}
                    className="flex gap-3 rounded-2xl border p-4"
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    ) : (
                      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{String(title)}</p>
                      <p className="text-sm text-muted-foreground">
                        {String(text)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && !lobbyId && (
          <Card>
            <CardHeader>
              <CardTitle>Joueurs en attente</CardTitle>
              <CardDescription>
                La liste publique ne révèle jamais le seed du match.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {waiting.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                  <Swords className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-4 font-semibold">
                    Aucun lobby V2 disponible
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Crée une règle puis publie-la pour ouvrir le premier lobby.
                  </p>
                  <Button asChild className="mt-5">
                    <Link to="/generator">Créer une variante</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {waiting.map((entry) => (
                    <div
                      key={entry.lobbyId}
                      className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{entry.lobbyName}</p>
                          <Badge variant="secondary">
                            {entry.legacyRuleIds.length} règle(s)
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {entry.legacyRuleIds.join(" · ")}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {dateLabel(entry.createdAt)} · empreinte{" "}
                          {entry.rulesetHash.slice(0, 12)}…
                        </p>
                      </div>
                      {entry.creatorId === user.id ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            navigate(
                              `/rule-lobby?lobbyId=${encodeURIComponent(
                                entry.lobbyId,
                              )}`,
                            )
                          }
                        >
                          Ouvrir mon lobby
                        </Button>
                      ) : (
                        <Button
                          className="gap-2"
                          disabled={busyId === entry.lobbyId}
                          onClick={() => void handleJoin(entry.lobbyId)}
                        >
                          {busyId === entry.lobbyId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                          Rejoindre
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </NeonBackground>
  );
}
