import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Clock3,
  Loader2,
  LogIn,
  Radio,
  RefreshCw,
  ShieldCheck,
  Swords,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

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
import { cn } from "@/lib/utils";
import {
  TIME_CONTROL_SETTINGS,
  type TimeControlOption,
} from "@/types/timeControl";
import {
  cancelChessMatchmaking,
  enqueueStandardMatchmaking,
  getLatestChessMatchmakingTicket,
  type ChessMatchmakingResult,
} from "./platform-api";
import { resolveActiveMatchmakingTicket } from "./matchmaking-state";

interface QuickPlayPanelProps {
  isAuthenticated: boolean;
  playerName: string;
  userId?: string;
}

const timeControls: readonly TimeControlOption[] = [
  "bullet",
  "blitz",
  "long",
  "untimed",
] as const;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function QuickPlayPanel({
  isAuthenticated,
  playerName,
  userId,
}: QuickPlayPanelProps) {
  const navigate = useNavigate();
  const [timeControl, setTimeControl] = useState<TimeControlOption>("blitz");
  const [pendingResult, setPendingResult] =
    useState<ChessMatchmakingResult | null>(null);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const [enqueueing, setEnqueueing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const requestKeyRef = useRef<string | null>(null);
  const selectedTimeControl = TIME_CONTROL_SETTINGS[timeControl];
  const supportsMatchmaking = selectedTimeControl.initialSeconds >= 30;

  const ticketQuery = useQuery({
    queryKey: ["chess-platform", "matchmaking-ticket", userId],
    queryFn: () => getLatestChessMatchmakingTicket(userId!),
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 0,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.status === "queued" ? 2_000 : false,
  });

  const activeTicket = useMemo(() => {
    return resolveActiveMatchmakingTicket({
      hasServerResponse: ticketQuery.isSuccess || ticketQuery.dataUpdatedAt > 0,
      serverTicket: ticketQuery.data,
      pendingResult,
    });
  }, [
    pendingResult,
    ticketQuery.data,
    ticketQuery.dataUpdatedAt,
    ticketQuery.isSuccess,
  ]);

  useEffect(() => {
    if (activeTicket?.status === "matched" && activeTicket.matchId) {
      navigate(`/match/${activeTicket.matchId}`, { replace: true });
    }
  }, [activeTicket, navigate]);

  const launchTraining = () => {
    navigate("/play", {
      state: {
        customRules: [],
        presetRuleIds: [],
        opponentType: "ai",
        playerName,
        timeControl,
      },
    });
  };

  const enqueue = async () => {
    if (!isAuthenticated || !userId) {
      navigate("/signup");
      return;
    }
    if (
      !supportsMatchmaking ||
      enqueueing ||
      ticketQuery.isLoading ||
      ticketQuery.isError ||
      activeTicket?.status === "queued"
    ) {
      return;
    }

    setEnqueueing(true);
    setEnqueueError(null);
    try {
      const requestKey = requestKeyRef.current ?? crypto.randomUUID();
      requestKeyRef.current = requestKey;
      const result = await enqueueStandardMatchmaking({
        requestKey,
        initialSeconds: selectedTimeControl.initialSeconds,
        incrementSeconds: 0,
      });
      setPendingResult(result);
      if (result.status === "matched" && result.matchId) {
        navigate(`/match/${result.matchId}`);
        return;
      }
      await ticketQuery.refetch();
    } catch (error) {
      setEnqueueError(
        errorMessage(
          error,
          "Le serveur n’a pas confirmé l’entrée dans la file.",
        ),
      );
    } finally {
      setEnqueueing(false);
    }
  };

  const cancelQueue = async () => {
    const ticketId = activeTicket?.ticketId;
    if (!ticketId || cancelling) return;
    setCancelling(true);
    setEnqueueError(null);
    try {
      const cancelled = await cancelChessMatchmaking(ticketId);
      const refreshed = await ticketQuery.refetch();
      if (!cancelled && refreshed.data?.status === "matched") return;
      setPendingResult(null);
      requestKeyRef.current = null;
    } catch (error) {
      setEnqueueError(
        errorMessage(error, "La file n’a pas pu être annulée avec certitude."),
      );
    } finally {
      setCancelling(false);
    }
  };

  const queued = activeTicket?.status === "queued";

  return (
    <Card className="overflow-hidden border-cyan-400/20 bg-[#070a1c]/90 shadow-[0_24px_80px_-42px_rgba(34,211,238,0.8)]">
      <CardHeader className="gap-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-fuchsia-500/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge className="w-fit border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
              <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Centre de jeu
            </Badge>
            <CardTitle className="text-2xl sm:text-3xl">
              Jouer maintenant
            </CardTitle>
            <CardDescription className="max-w-xl text-cyan-100/65">
              Entraîne-toi contre l’IA ou rejoins la vraie file standard non
              classée. Le serveur associe deux joueurs sur la même cadence.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70">
            <Clock3 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            {selectedTimeControl.label}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5 sm:p-6">
        <fieldset disabled={queued || enqueueing || cancelling}>
          <legend className="mb-3 text-sm font-semibold text-white">
            Cadence
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {timeControls.map((option) => {
              const details = TIME_CONTROL_SETTINGS[option];
              const selected = option === timeControl;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTimeControl(option)}
                  className={cn(
                    "min-h-16 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070a1c] disabled:cursor-not-allowed disabled:opacity-70",
                    selected
                      ? "border-cyan-300/60 bg-cyan-400/15 text-white shadow-[0_0_22px_rgba(34,211,238,0.16)]"
                      : "border-white/10 bg-white/[0.035] text-white/60 hover:border-white/20 hover:text-white",
                  )}
                >
                  <span className="block text-sm font-semibold">
                    {details.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-current/70">
                    {details.initialSeconds === 0
                      ? "IA uniquement"
                      : `${Math.floor(details.initialSeconds / 60)} min`}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            className="h-auto min-h-16 justify-start gap-3 rounded-xl bg-gradient-to-r from-cyan-300 to-sky-400 px-4 text-left text-slate-950 hover:from-cyan-200 hover:to-sky-300"
            onClick={launchTraining}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950/10">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block font-bold">Jouer contre l’IA</span>
              <span className="block text-xs font-medium opacity-75">
                Échecs classiques · démarrage immédiat
              </span>
            </span>
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="h-auto min-h-16 justify-start gap-3 rounded-xl border-fuchsia-300/30 bg-fuchsia-400/10 px-4 text-left text-fuchsia-50 hover:border-fuchsia-300/50 hover:bg-fuchsia-400/15 hover:text-white"
            onClick={() => void enqueue()}
            disabled={
              (isAuthenticated && !supportsMatchmaking) ||
              queued ||
              enqueueing ||
              cancelling ||
              (isAuthenticated &&
                (ticketQuery.isLoading || ticketQuery.isError))
            }
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-fuchsia-300/10">
              {enqueueing || queued ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : isAuthenticated ? (
                <Users className="h-5 w-5" aria-hidden="true" />
              ) : (
                <LogIn className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <span>
              <span className="block font-bold">
                {!isAuthenticated
                  ? "Se connecter pour jouer"
                  : queued
                    ? "Recherche en cours…"
                    : !supportsMatchmaking
                      ? "Cadence indisponible"
                      : enqueueError
                        ? "Réessayer la même requête"
                        : "Match standard"}
              </span>
              <span className="block text-xs font-medium text-fuchsia-100/65">
                {!isAuthenticated
                  ? "Le matchmaking nécessite un compte"
                  : !supportsMatchmaking
                    ? "Le serveur exige au moins 30 secondes"
                    : "Non classé · cadence identique · règles standard"}
              </span>
            </span>
          </Button>
        </div>

        {queued && (
          <Alert className="border-cyan-300/25 bg-cyan-300/10 text-cyan-50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <AlertTitle>Ticket confirmé par le serveur</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                La file est interrogée toutes les deux secondes. Dès que le
                ticket passe à « matched », le match est ouvert automatiquement.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void cancelQueue()}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                Annuler la recherche
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isAuthenticated && ticketQuery.isLoading && !pendingResult && (
          <p className="flex items-center gap-2 text-xs text-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Récupération de ton dernier ticket…
          </p>
        )}

        {isAuthenticated && ticketQuery.isError && !queued && (
          <Alert variant="destructive">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>État de file indisponible</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Le ticket protégé par RLS n’a pas pu être relu. Actualise son
                état avant de lancer une nouvelle recherche.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void ticketQuery.refetch()}
              >
                Relire le ticket
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {enqueueError && (
          <Alert variant="destructive">
            <Swords className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Matchmaking non confirmé</AlertTitle>
            <AlertDescription>{enqueueError}</AlertDescription>
          </Alert>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-white/45">
          <ShieldCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          Cette file ne crée ni saison ni classement : elle envoie toujours
          ruleset standard, rated=false et une clé UUID idempotente au serveur.
        </p>
      </CardContent>
    </Card>
  );
}
