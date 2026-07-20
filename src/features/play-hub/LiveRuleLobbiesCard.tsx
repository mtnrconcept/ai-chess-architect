import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Radio,
  RefreshCw,
  Users,
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
import {
  listRuleLobbies,
  type RuleLobbySummary,
} from "@/features/rule-architect/lobby-api";

interface LiveRuleLobbiesCardProps {
  isAuthenticated: boolean;
}

const shortHash = (hash: string): string =>
  hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;

function LobbyRow({ lobby }: { lobby: RuleLobbySummary }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" />
          <p className="truncate font-semibold text-white">{lobby.lobbyName}</p>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-white/40">
          {lobby.legacyRuleIds.length} règle
          {lobby.legacyRuleIds.length > 1 ? "s" : ""} ·{" "}
          {shortHash(lobby.rulesetHash)}
        </p>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link to={`/rule-lobby?lobbyId=${encodeURIComponent(lobby.lobbyId)}`}>
          Voir
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </li>
  );
}

export function LiveRuleLobbiesCard({
  isAuthenticated,
}: LiveRuleLobbiesCardProps) {
  const query = useQuery<RuleLobbySummary[], Error>({
    queryKey: ["play-hub", "rule-lobbies"],
    queryFn: listRuleLobbies,
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated ? 15_000 : false,
    staleTime: 5_000,
  });

  const waiting = (query.data ?? [])
    .filter((lobby) => lobby.status === "waiting" && lobby.mode === "player")
    .slice(0, 3);

  return (
    <Card className="border-emerald-300/20 bg-[#07120f]/85">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-emerald-300/30 bg-emerald-300/10 text-emerald-100">
            <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Lobbies en direct
          </Badge>
          {query.isFetching && !query.isLoading && (
            <Loader2
              className="h-4 w-4 animate-spin text-emerald-200/60"
              aria-label="Actualisation"
            />
          )}
        </div>
        <CardTitle>Parties Rule Architect</CardTitle>
        <CardDescription className="text-emerald-50/55">
          Salles publiques en attente, chargées depuis Supabase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isAuthenticated ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-white/60">
            <Users
              className="mb-3 h-5 w-5 text-emerald-300"
              aria-hidden="true"
            />
            <p>
              Connecte-toi pour afficher et rejoindre les salles disponibles.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/signup">Connexion ou inscription</Link>
            </Button>
          </div>
        ) : query.isLoading ? (
          <div className="space-y-2" aria-label="Chargement des lobbies">
            {["one", "two", "three"].map((key) => (
              <Skeleton key={key} className="h-[68px] w-full bg-white/10" />
            ))}
          </div>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Lobbies indisponibles</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{query.error.message || "Le chargement a échoué."}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        ) : waiting.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-white/60">
            <p>Aucune salle publique n'attend de joueur actuellement.</p>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link to="/generator">Créer la première salle</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {waiting.map((lobby) => (
              <LobbyRow key={lobby.lobbyId} lobby={lobby} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
