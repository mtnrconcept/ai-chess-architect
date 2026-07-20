import { Flame, Medal, Target, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  calculateProgressLevel,
  calculateServerProgressLevel,
  type LocalPlayerProgress,
} from "./progression";

interface ProgressionCardProps {
  progress: LocalPlayerProgress;
  source?: "local" | "server";
  serverLevel?: number;
}

export function ProgressionCard({
  progress,
  source = "local",
  serverLevel,
}: ProgressionCardProps) {
  const level =
    source === "server" && serverLevel
      ? calculateServerProgressLevel(progress.xp, serverLevel)
      : calculateProgressLevel(progress.xp);
  const hasStarted = progress.puzzlesSolved > 0;

  return (
    <Card className="border-violet-300/20 bg-[#090818]/90">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-violet-300/30 bg-violet-300/10 text-violet-100">
            <Trophy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {source === "server"
              ? "Progression synchronisée"
              : "Progression locale"}
          </Badge>
          <span className="font-mono text-sm font-semibold text-violet-100/80">
            {progress.xp} XP
          </span>
        </div>
        <CardTitle>Niveau {level.level}</CardTitle>
        <CardDescription className="text-violet-100/60">
          {source === "server"
            ? "XP, niveau et séries validés par le serveur."
            : "Tes défis quotidiens font progresser ce profil sur cet appareil."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-white/55">
            <span>{level.currentLevelXp} XP</span>
            <span>{level.nextLevelXp} XP</span>
          </div>
          <Progress
            value={level.percentage}
            aria-label={`Progression du niveau ${level.level} : ${level.percentage} %`}
            className="h-2 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-violet-400 [&>div]:to-fuchsia-400"
          />
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <Target
              className="mx-auto h-4 w-4 text-cyan-300"
              aria-hidden="true"
            />
            <dt className="mt-2 text-[11px] text-white/45">Résolus</dt>
            <dd className="mt-1 font-mono text-lg font-bold">
              {progress.puzzlesSolved}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <Flame
              className="mx-auto h-4 w-4 text-orange-300"
              aria-hidden="true"
            />
            <dt className="mt-2 text-[11px] text-white/45">Série</dt>
            <dd className="mt-1 font-mono text-lg font-bold">
              {progress.currentStreak}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
            <Medal
              className="mx-auto h-4 w-4 text-amber-300"
              aria-hidden="true"
            />
            <dt className="mt-2 text-[11px] text-white/45">Record</dt>
            <dd className="mt-1 font-mono text-lg font-bold">
              {progress.bestStreak}
            </dd>
          </div>
        </dl>

        {!hasStarted && (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-sm text-white/55">
            Résous le puzzle du jour pour gagner tes premiers XP et démarrer ta
            série{source === "server" ? " synchronisée" : ""}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
