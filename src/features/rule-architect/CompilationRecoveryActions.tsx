import { RefreshCcw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CompilationRecoveryActionsProps = {
  message: string;
  code?: string | null;
  newRequestRequired: boolean;
  disabled?: boolean;
  onRetry: () => void;
  onReset: () => void;
};

export function CompilationRecoveryActions({
  message,
  code,
  newRequestRequired,
  disabled = false,
  onRetry,
  onReset,
}: CompilationRecoveryActionsProps) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <div className="space-y-1 text-destructive">
        <p>{message}</p>
        {code && <p className="text-xs opacity-80">Référence : {code}</p>}
      </div>

      <p className="text-xs text-muted-foreground">
        {newRequestRequired
          ? "Le serveur a confirmé que cette demande ne peut plus être rejouée. Réinitialise-la avant de relancer la compilation."
          : "Une nouvelle tentative réutilisera la même clé afin de retrouver une éventuelle compilation déjà réservée."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        {!newRequestRequired && (
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={onRetry}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Nouvelle tentative
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onReset}
          className="gap-2"
        >
          <RefreshCcw className="h-4 w-4" />
          {newRequestRequired
            ? "Réinitialiser la tentative"
            : "Réinitialiser la demande"}
        </Button>
      </div>
    </div>
  );
}
