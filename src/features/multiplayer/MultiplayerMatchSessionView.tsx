import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  History,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  TimerOff,
  WifiOff,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatClock } from "./clock";
import type {
  MatchIdentity,
  MatchParticipant,
  MatchSide,
  RealtimeConnectionStatus,
} from "./contracts";
import { canonicalFenFromMoves } from "./fen";
import { truncateServerIdentity } from "./match-bootstrap";
import {
  ProcessChessMoveError,
  processChessMove,
  type ProcessMoveFunctionsClient,
} from "./move-api";
import { MultiplayerBoard } from "./MultiplayerBoard";
import type { SupabaseMultiplayerAdapter } from "./supabase-adapter";
import { canClaimDisplayedTimeout } from "./terminal-actions";
import { useMultiplayerMatch } from "./useMultiplayerMatch";

interface MultiplayerMatchSessionViewProps {
  adapter: SupabaseMultiplayerAdapter;
  functionsClient: ProcessMoveFunctionsClient;
  identity: MatchIdentity;
  userId: string;
}

const CONNECTION_LABELS: Readonly<Record<RealtimeConnectionStatus, string>> =
  Object.freeze({
    idle: "En attente",
    connecting: "Connexion",
    connected: "Temps réel connecté",
    reconnecting: "Reconnexion",
    offline: "Hors ligne",
    closed: "Session fermée",
    error: "Erreur temps réel",
  });

const PHASE_LABELS = Object.freeze({
  synchronizing: "Synchronisation",
  waiting: "En attente de l'adversaire",
  playing: "Partie en cours",
  paused: "Partie en pause",
  finished: "Partie terminée",
  abandoned: "Partie abandonnée",
  error: "Synchronisation interrompue",
});

const sideLabel = (side: MatchSide): string =>
  side === "white" ? "Blancs" : "Noirs";

const participantLabel = (
  participant: MatchParticipant,
  userId: string,
): string => (participant.userId === userId ? "Vous" : "Adversaire");

const identityMatches = (left: MatchIdentity, right: MatchIdentity): boolean =>
  left.matchId === right.matchId &&
  left.lobbyId === right.lobbyId &&
  left.rulesetHash === right.rulesetHash &&
  left.matchSeed === right.matchSeed &&
  left.engineVersion === right.engineVersion;

export function MultiplayerMatchSessionView({
  adapter,
  functionsClient,
  identity,
  userId,
}: MultiplayerMatchSessionViewProps) {
  const {
    state,
    connection,
    clock,
    presence,
    bufferedEvents,
    missingSequence,
    claimTimeout,
    resignMatch,
    recover,
  } = useMultiplayerMatch({
    identity,
    store: adapter,
    realtime: adapter,
  });
  const [movePending, setMovePending] = useState(false);
  const [moveError, setMoveError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resignationPending, setResignationPending] = useState(false);
  const [timeoutClaimPending, setTimeoutClaimPending] = useState(false);
  const [customRulesUnavailable, setCustomRulesUnavailable] = useState(false);

  const player = state.participants.find(
    (participant) => participant.userId === userId,
  );
  const playerSide = player?.side ?? null;
  const identityMismatch = !identityMatches(identity, state.identity);
  const participantIdentityMissing =
    state.phase !== "synchronizing" && playerSide === null;
  const canonicalFen = canonicalFenFromMoves(state.moves);
  const lastMove = state.moves.length
    ? state.moves[state.moves.length - 1]
    : null;

  const interactionBlockReason = (() => {
    if (customRulesUnavailable) {
      return "Le validateur serveur des règles personnalisées n'est pas encore disponible. Aucun coup local ne sera appliqué.";
    }
    if (identityMismatch || participantIdentityMissing) {
      return "L'identité du joueur ne correspond pas aux participants de ce match.";
    }
    if (state.phase === "synchronizing") {
      return "Synchronisation de l'état canonique…";
    }
    if (state.phase === "finished" || state.phase === "abandoned") {
      return "Cette partie est terminée.";
    }
    if (state.phase === "error") {
      return "L'état serveur doit être resynchronisé avant de jouer.";
    }
    if (connection !== "connected") {
      return "La connexion Realtime doit être confirmée avant de jouer.";
    }
    if (state.phase !== "playing") {
      return state.phase === "paused"
        ? "La partie est en pause côté serveur."
        : "La partie n'a pas encore commencé.";
    }
    if (movePending || resignationPending || timeoutClaimPending) {
      return "Le serveur traite l'action. L'échiquier attend l'événement canonique.";
    }
    if (playerSide === null || state.currentSide !== playerSide) {
      return "C'est au tour de l'adversaire.";
    }
    return null;
  })();

  const submitMoveIntent = async (uci: string): Promise<void> => {
    if (interactionBlockReason || playerSide === null) return;
    setMovePending(true);
    setMoveError(null);
    setNotice(null);
    try {
      const receipt = await processChessMove(functionsClient, {
        matchId: identity.matchId,
        expectedRevision: state.lastRevision,
        clientCommandId: crypto.randomUUID(),
        uci,
      });
      setNotice(
        receipt.alreadyProcessed
          ? "Commande déjà traitée. Resynchronisation en cours…"
          : "Coup validé par le serveur. Attente de l'événement Realtime…",
      );
    } catch (error) {
      if (error instanceof ProcessChessMoveError) {
        if (error.code === "CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE") {
          setCustomRulesUnavailable(true);
        }
        setMoveError({ code: error.code, message: error.message });
      } else {
        setMoveError({
          code: "PROCESSING_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Le coup n'a pas pu être validé.",
        });
      }
    } finally {
      try {
        await recover();
      } catch {
        // The hook exposes the canonical recovery error state.
      }
      setMovePending(false);
    }
  };

  const submitResignation = async (): Promise<void> => {
    if (
      connection !== "connected" ||
      identityMismatch ||
      participantIdentityMissing ||
      movePending ||
      resignationPending ||
      timeoutClaimPending ||
      (state.phase !== "playing" && state.phase !== "paused")
    ) {
      return;
    }
    setResignationPending(true);
    setMoveError(null);
    setNotice(null);
    try {
      const receipt = await resignMatch();
      setNotice(
        receipt.finalized
          ? "Abandon finalisé par le serveur. Resynchronisation du résultat…"
          : "Cette partie était déjà finalisée par le serveur. Resynchronisation…",
      );
    } catch (error) {
      setMoveError({
        code: "RESIGNATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "L'abandon n'a pas pu être finalisé par le serveur.",
      });
    } finally {
      try {
        await recover();
      } catch {
        // The canonical session exposes recovery failures.
      }
      setResignationPending(false);
    }
  };

  const submitTimeoutClaim = async (): Promise<void> => {
    if (
      !canClaimDisplayedTimeout({ phase: state.phase, playerSide, clock }) ||
      connection !== "connected" ||
      identityMismatch ||
      participantIdentityMissing ||
      movePending ||
      resignationPending ||
      timeoutClaimPending
    ) {
      return;
    }
    setTimeoutClaimPending(true);
    setMoveError(null);
    setNotice(null);
    try {
      const receipt = await claimTimeout();
      setNotice(
        receipt.finalized
          ? "Temps écoulé confirmé par le serveur. Resynchronisation du résultat…"
          : "Le serveur avait déjà finalisé cette position. Resynchronisation…",
      );
    } catch (error) {
      setMoveError({
        code: "TIMEOUT_CLAIM_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Le serveur a refusé la réclamation au temps.",
      });
    } finally {
      try {
        await recover();
      } catch {
        // The canonical session exposes recovery failures.
      }
      setTimeoutClaimPending(false);
    }
  };

  const orderedParticipants = [...state.participants].sort((left, right) => {
    if (left.userId === userId) return 1;
    if (right.userId === userId) return -1;
    return left.side.localeCompare(right.side);
  });
  const showTimeoutClaim = canClaimDisplayedTimeout({
    phase: state.phase,
    playerSide,
    clock,
  });
  const terminalActionPending =
    movePending || resignationPending || timeoutClaimPending;
  const resignDisabled =
    terminalActionPending ||
    connection !== "connected" ||
    identityMismatch ||
    participantIdentityMissing ||
    (state.phase !== "playing" && state.phase !== "paused");

  return (
    <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "border-white/20 bg-slate-950/60 text-white",
                connection === "connected" &&
                  "border-emerald-300/40 text-emerald-200",
                connection !== "connected" && "text-amber-200",
              )}
            >
              {connection === "connected" ? (
                <Radio className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <WifiOff className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {CONNECTION_LABELS[connection]}
            </Badge>
            <Badge
              variant="outline"
              className="border-fuchsia-300/30 text-fuchsia-100"
            >
              {PHASE_LABELS[state.phase]}
            </Badge>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Partie multijoueur
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Les coups, horloges et résultats affichés proviennent uniquement du
            serveur.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/20 bg-slate-950/70 text-white hover:bg-white/10 hover:text-white"
            onClick={() => void recover()}
            disabled={state.phase === "synchronizing"}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Resynchroniser
          </Button>
          {showTimeoutClaim && (
            <Button
              type="button"
              className="bg-amber-400 text-slate-950 hover:bg-amber-300"
              onClick={() => void submitTimeoutClaim()}
              disabled={
                terminalActionPending ||
                connection !== "connected" ||
                identityMismatch ||
                participantIdentityMissing
              }
            >
              {timeoutClaimPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <TimerOff className="h-4 w-4" aria-hidden="true" />
              )}
              Réclamer au temps
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={resignDisabled}
              >
                {resignationPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Flag className="h-4 w-4" aria-hidden="true" />
                )}
                Abandonner
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-white/10 bg-slate-950 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Abandonner la partie ?</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-300">
                  Le serveur enregistrera immédiatement une défaite par abandon
                  si la partie et sa révision sont encore valides. Le navigateur
                  ne produit jamais le résultat localement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  Continuer la partie
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 text-white hover:bg-red-500"
                  onClick={() => void submitResignation()}
                >
                  Confirmer l'abandon
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {(identityMismatch || participantIdentityMissing) && (
        <div
          className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-100"
          role="alert"
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          Identité de match incompatible. Les interactions sont bloquées et
          aucune correction locale n'est tentée.
        </div>
      )}

      {customRulesUnavailable && (
        <div
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300/40 bg-amber-950/40 p-4 text-sm text-amber-100"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0"
            aria-hidden="true"
          />
          <span>
            <strong>Règles personnalisées indisponibles pour ce match.</strong>{" "}
            Le validateur serveur a refusé le coup avec le code{" "}
            <code className="break-all font-mono text-xs">
              CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE
            </code>
            . Aucun moteur local de secours n'est utilisé.
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3" aria-label="Partie et horloges">
          {orderedParticipants.length > 0 ? (
            orderedParticipants.map((participant) => {
              const assessment = presence.find(
                (item) => item.userId === participant.userId,
              );
              const remainingMs =
                participant.side === "white"
                  ? clock?.whiteRemainingMs
                  : clock?.blackRemainingMs;
              const active = clock?.activeSide === participant.side;
              return (
                <div
                  key={participant.userId}
                  className={cn(
                    "flex items-center justify-between rounded-xl border bg-slate-950/75 px-4 py-3",
                    active
                      ? "border-cyan-300/50 shadow-[0_0_28px_-18px_rgba(34,211,238,0.9)]"
                      : "border-white/10",
                  )}
                >
                  <div>
                    <p className="font-semibold text-white">
                      {participantLabel(participant, userId)} ·{" "}
                      {sideLabel(participant.side)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Présence serveur :{" "}
                      {assessment?.state === "connected"
                        ? "connecté"
                        : assessment?.state === "reconnecting"
                          ? "connexion instable"
                          : assessment?.state === "abandonment_candidate"
                            ? "absence prolongée"
                            : "inconnue"}
                    </p>
                  </div>
                  <time
                    className={cn(
                      "font-mono text-2xl font-black tabular-nums text-white sm:text-3xl",
                      active && "text-cyan-200",
                      remainingMs === 0 && "text-red-300",
                    )}
                  >
                    {remainingMs === undefined
                      ? "--:--"
                      : formatClock(remainingMs)}
                  </time>
                </div>
              );
            })
          ) : (
            <div className="h-[76px] animate-pulse rounded-xl border border-white/10 bg-slate-950/60" />
          )}

          <MultiplayerBoard
            fen={canonicalFen}
            perspective={playerSide ?? "white"}
            disabled={interactionBlockReason !== null}
            lastMove={lastMove}
            onMoveIntent={(uci) => void submitMoveIntent(uci)}
          />

          <div
            className={cn(
              "min-h-12 rounded-xl border px-4 py-3 text-sm",
              moveError
                ? "border-red-400/40 bg-red-950/35 text-red-100"
                : notice
                  ? "border-emerald-300/30 bg-emerald-950/30 text-emerald-100"
                  : "border-white/10 bg-slate-950/60 text-slate-300",
            )}
            aria-live="polite"
          >
            {movePending && (
              <Loader2
                className="mr-2 inline h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {moveError ? (
              <>
                <strong>{moveError.code}</strong> — {moveError.message}
              </>
            ) : (
              (notice ??
              interactionBlockReason ??
              "Sélectionnez une pièce puis sa destination.")
            )}
          </div>
        </section>

        <aside className="space-y-5" aria-label="Informations du match">
          <Card className="border-white/10 bg-slate-950/75 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                Historique canonique
              </CardTitle>
              <CardDescription className="text-slate-400">
                Uniquement les coups commités par le serveur.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 pr-3">
                {state.moves.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun coup commité.</p>
                ) : (
                  <ol className="space-y-2">
                    {state.moves.map((move) => (
                      <li
                        key={`${move.ply}-${move.positionHash}`}
                        className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs text-slate-500">
                          #{move.ply}
                        </span>
                        <span className="font-semibold text-white">
                          {move.san ?? move.uci}
                        </span>
                        <span className="text-xs text-slate-400">
                          {sideLabel(move.side)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/75 text-white">
            <CardHeader>
              <CardTitle className="text-lg">Identité partagée</CardTitle>
              <CardDescription className="text-slate-400">
                Ces valeurs lient les deux clients au même moteur déterministe.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Ruleset hash
                </p>
                <code className="break-all font-mono text-cyan-200">
                  {truncateServerIdentity(identity.rulesetHash)}
                </code>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Seed partagé
                </p>
                <code className="break-all font-mono text-fuchsia-200">
                  {truncateServerIdentity(identity.matchSeed, 6)}
                </code>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <span>Révision {Math.max(0, state.lastRevision)}</span>
                <span>Séquence {Math.max(0, state.lastSequence)}</span>
                <span>Buffer {bufferedEvents}</span>
                <span>
                  {missingSequence === null
                    ? "Journal continu"
                    : `Manque ${missingSequence}`}
                </span>
              </div>
            </CardContent>
          </Card>

          {state.result && (
            <Card className="border-emerald-300/30 bg-emerald-950/30 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2
                    className="h-5 w-5 text-emerald-300"
                    aria-hidden="true"
                  />
                  Résultat serveur
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-emerald-100">
                {state.result.winner
                  ? `${sideLabel(state.result.winner)} gagnent`
                  : "Partie nulle"}{" "}
                · {state.result.reason}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
