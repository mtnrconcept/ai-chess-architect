import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LiveCoachAvatarProps {
  enabled: boolean;
  loading: boolean;
  message: string | null;
  remoteUnavailable?: boolean;
  moveCount: number;
  onOpen: () => void;
  onEnable: () => void;
}

const trimMessage = (message: string, limit = 190) =>
  message.length <= limit ? message : `${message.slice(0, limit).trimEnd()}…`;

export default function LiveCoachAvatar({
  enabled,
  loading,
  message,
  remoteUnavailable = false,
  moveCount,
  onOpen,
  onEnable,
}: LiveCoachAvatarProps) {
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [lastSeenMove, setLastSeenMove] = useState(moveCount);

  useEffect(() => {
    if (!enabled || moveCount <= lastSeenMove) return;
    setDismissed(false);
    setExpanded(true);
    setLastSeenMove(moveCount);
  }, [enabled, lastSeenMove, moveCount]);

  const visibleMessage = useMemo(() => {
    if (loading) return "J’analyse le dernier coup…";
    if (message?.trim()) return trimMessage(message.trim());
    if (remoteUnavailable) {
      return "Analyse locale active. Le coach distant se reconnectera automatiquement.";
    }
    return "Joue un coup : je commenterai immédiatement la position.";
  }, [loading, message, remoteUnavailable]);

  const bottomClass =
    "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+1rem)]";

  if (dismissed) {
    return (
      <Button
        type="button"
        size="icon"
        onClick={() => setDismissed(false)}
        className={cn(
          "fixed right-4 z-40 h-14 w-14 rounded-full shadow-2xl lg:hidden",
          bottomClass,
        )}
        aria-label="Afficher le coach Voltus"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={onEnable}
        className={cn(
          "fixed right-4 z-40 flex items-center gap-3 rounded-full border border-cyan-300/30 bg-slate-950/95 px-4 py-3 text-left text-white shadow-2xl backdrop-blur lg:hidden",
          bottomClass,
        )}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500">
          <Bot className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-bold">Activer le coach</span>
          <span className="block text-xs text-white/60">
            Commentaires après chaque coup
          </span>
        </span>
      </button>
    );
  }

  return (
    <section
      className={cn(
        "fixed left-3 right-3 z-40 overflow-hidden rounded-3xl border border-cyan-300/25 bg-slate-950/95 text-white shadow-[0_24px_80px_rgba(8,145,178,0.35)] backdrop-blur-xl transition lg:hidden",
        bottomClass,
        !expanded && "left-auto w-auto rounded-full",
      )}
      aria-live="polite"
      aria-label="Coach Voltus en temps réel"
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onOpen}
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 shadow-lg"
          aria-label="Ouvrir le coach complet"
        >
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Bot className="h-6 w-6" />
          )}
          <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-yellow-200" />
        </button>

        {expanded && (
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
              Coach Voltus
              {moveCount > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 normal-case tracking-normal text-white/70">
                  coup {moveCount}
                </span>
              )}
            </span>
            <span className="mt-1 block text-sm leading-5 text-white/90">
              {visibleMessage}
            </span>
          </button>
        )}

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Réduire le coach" : "Déployer le coach"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
          {expanded && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setDismissed(true)}
              aria-label="Masquer temporairement le coach"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
