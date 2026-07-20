import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

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
import { chessBoardFromFen, sideToMoveFromFen } from "./daily-puzzles";
import {
  submitServerDailyPuzzle,
  type DailyPuzzleSubmission,
  type ServerDailyPuzzle,
} from "./platform-api";
import { PuzzleBoard } from "./PuzzleBoard";

interface ServerDailyPuzzleCardProps {
  puzzle: ServerDailyPuzzle;
  onServerStateChanged: () => Promise<void>;
}

export function ServerDailyPuzzleCard({
  puzzle,
  onServerStateChanged,
}: ServerDailyPuzzleCardProps) {
  const startedAtRef = useRef(Date.now());
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(
    null,
  );
  const [submission, setSubmission] = useState<DailyPuzzleSubmission | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!puzzle.available || !puzzle.puzzleId || !puzzle.fen) {
    return null;
  }

  let perspective: "white" | "black" | null;
  try {
    perspective = sideToMoveFromFen(puzzle.fen);
    chessBoardFromFen(puzzle.fen, perspective);
  } catch {
    perspective = null;
  }

  const status = submission?.attemptStatus ?? puzzle.attemptStatus;
  const solved = status === "solved";
  const failed = status === "failed";
  const attemptCount = submission?.attemptCount ?? puzzle.attemptCount;

  const submitMove = async (move: string) => {
    if (submitting || solved || failed) return;
    setSubmitting(true);
    setSelectedSubmission(move);
    setError(null);
    try {
      const elapsed = Math.min(
        86_400_000,
        Math.max(0, Date.now() - startedAtRef.current),
      );
      const result = await submitServerDailyPuzzle(
        puzzle.puzzleId!,
        [move],
        elapsed,
      );
      setSubmission(result);
      await onServerStateChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La tentative n’a pas pu être validée.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resynchronize = async () => {
    setSubmitting(true);
    try {
      await onServerStateChanged();
      setError(null);
      setSubmission(null);
      setSelectedSubmission(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La resynchronisation a échoué.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="overflow-hidden border-amber-300/20 bg-[#0b0a18]/90">
      <CardHeader className="gap-3 border-b border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="border-emerald-300/30 bg-emerald-300/10 text-emerald-100">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Puzzle officiel · serveur
          </Badge>
          <span className="text-xs font-semibold text-amber-100/60">
            {puzzle.rating
              ? `Difficulté ${puzzle.rating}`
              : "Difficulté non cotée"}
            {` · ${attemptCount}/20 essais`}
          </span>
        </div>
        <CardTitle className="text-2xl">
          {puzzle.title ?? "Problème du jour"}
        </CardTitle>
        <CardDescription className="text-amber-50/65">
          {perspective
            ? `${perspective === "white" ? "Les Blancs" : "Les Noirs"} jouent. La réponse est vérifiée exclusivement côté serveur.`
            : "La position reçue est invalide. Aucun coup ne sera envoyé."}
        </CardDescription>
        {puzzle.themes.length > 0 && (
          <div
            className="flex flex-wrap gap-2 pt-1"
            aria-label="Thèmes du puzzle"
          >
            {puzzle.themes.map((theme) => (
              <Badge
                key={theme}
                variant="outline"
                className="text-[10px] text-white/60"
              >
                {theme}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(220px,0.9fr)_minmax(240px,1.1fr)]">
        <PuzzleBoard
          fen={puzzle.fen}
          perspective={perspective ?? "white"}
          selectedMove={selectedSubmission}
          disabled={submitting || solved || failed || Boolean(error)}
          onMoveSelected={
            perspective ? (move) => void submitMove(move) : undefined
          }
        />

        <div className="flex min-w-0 flex-col justify-center gap-4">
          {perspective ? (
            <Alert className="border-amber-300/20 bg-amber-300/[0.07] text-amber-50">
              {submitting ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-label="Validation"
                />
              ) : (
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
              )}
              <AlertTitle>
                {submitting ? "Validation serveur…" : "Joue ton coup"}
              </AlertTitle>
              <AlertDescription>
                Sélectionne d’abord la case de départ, puis la case d’arrivée.
                Une promotion éventuelle devient automatiquement une dame. Le
                navigateur ne reçoit aucune liste de réponses.
                {selectedSubmission && (
                  <span className="mt-2 block font-mono text-xs text-amber-100/70">
                    Dernier UCI envoyé : {selectedSubmission}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Position refusée</AlertTitle>
              <AlertDescription>
                Le FEN ne respecte pas le format attendu. L’interaction reste
                désactivée (fail-closed).
              </AlertDescription>
            </Alert>
          )}

          {solved && (
            <Alert className="border-emerald-300/25 bg-emerald-400/10 text-emerald-50">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Puzzle résolu</AlertTitle>
              <AlertDescription>
                Le serveur a validé la combinaison.
                {submission?.xpAwarded
                  ? ` ${submission.xpAwarded} XP ont été ajoutés.`
                  : " La récompense avait déjà été attribuée."}
              </AlertDescription>
            </Alert>
          )}

          {!solved && submission?.solved === false && !failed && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Ce n’est pas la ligne attendue</AlertTitle>
              <AlertDescription>
                Le serveur a enregistré l’essai. Analyse la position avant de
                proposer un autre coup.
              </AlertDescription>
            </Alert>
          )}

          {failed && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Limite d’essais atteinte</AlertTitle>
              <AlertDescription>
                Aucun nouvel essai ne peut être envoyé pour ce puzzle.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Validation incertaine</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{error}</p>
                <p>
                  L’état est resynchronisé avant toute nouvelle tentative afin
                  d’éviter un double envoi silencieux.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void resynchronize()}
                  disabled={submitting}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Resynchroniser
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <p className="text-xs leading-relaxed text-white/40">
            La solution n’est jamais téléchargée dans le navigateur. Seuls le
            FEN, les métadonnées publiques et le résultat de ta tentative sont
            reçus.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
