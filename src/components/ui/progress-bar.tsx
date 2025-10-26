import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  duration?: number;
  className?: string;
}

export function ProgressBar({ duration = 3000, className }: ProgressBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const increment = (100 / duration) * 50;
        const next = prev + increment;
        return next > 95 ? 95 : next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/30">
        <div
          className="h-full bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-shimmer transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
      </div>
      <p className="text-center text-sm text-muted-foreground animate-pulse">
        Génération de votre règle en cours...
      </p>
    </div>
  );
}
