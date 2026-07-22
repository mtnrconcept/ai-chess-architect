import { useMemo, useState } from "react";
import { Loader2, Sparkles, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ChessBoardAdapter } from "@/engine/adapters/chessBoardAdapter";
import type { PieceID, Tile, UIActionSpec } from "@/engine/types";
import type { PieceColor, Position } from "@/types/chess";
import type { RuleActionRunResult } from "@/hooks/useRuleEngine";

interface RuleActionDockProps {
  actions: UIActionSpec[];
  boardAdapter: ChessBoardAdapter;
  selectedPiecePosition: Position | null;
  currentPlayer: PieceColor;
  disabled?: boolean;
  runAction: (
    actionId: string,
    pieceId?: PieceID,
    targetTile?: Tile,
  ) => RuleActionRunResult;
}

const positionToTile = (position: Position): Tile =>
  `${String.fromCharCode(97 + position.col)}${8 - position.row}` as Tile;

const actionRequiresTarget = (action: UIActionSpec): boolean =>
  (action.targeting?.mode ?? "none") !== "none";

export default function RuleActionDock({
  actions,
  boardAdapter,
  selectedPiecePosition,
  currentPlayer,
  disabled = false,
  runAction,
}: RuleActionDockProps) {
  const { toast } = useToast();
  const [targetingAction, setTargetingAction] =
    useState<UIActionSpec | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const selectedPieceId = useMemo(() => {
    if (!selectedPiecePosition) return undefined;
    try {
      return (
        boardAdapter.getPieceAt(positionToTile(selectedPiecePosition)) ??
        undefined
      );
    } catch {
      return undefined;
    }
  }, [boardAdapter, selectedPiecePosition]);

  const visibleActions = useMemo(
    () =>
      actions.filter((action) => {
        const pieceTypes = action.availability?.pieceTypes ?? [];
        if (pieceTypes.length === 0 || !selectedPieceId) return true;
        try {
          return pieceTypes.includes(boardAdapter.getPiece(selectedPieceId).type);
        } catch {
          return false;
        }
      }),
    [actions, boardAdapter, selectedPieceId],
  );

  const execute = async (action: UIActionSpec, targetTile?: Tile) => {
    if (submitting || disabled) return;
    setSubmitting(action.id);
    try {
      const result = runAction(action.id, selectedPieceId, targetTile);
      if (!result.ok) {
        toast({
          title: "Action spéciale indisponible",
          description: result.reason ?? "Vérifie la cible et réessaie.",
          variant: "destructive",
        });
        return;
      }
      setTargetingAction(null);
      toast({
        title: action.label,
        description: "L’action a été transmise au moteur de règles.",
      });
    } finally {
      window.setTimeout(() => setSubmitting(null), 300);
    }
  };

  if (visibleActions.length === 0) return null;

  return (
    <>
      <section className="rounded-2xl border border-fuchsia-400/30 bg-slate-950/70 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold text-white">
              <Sparkles className="h-4 w-4 text-fuchsia-300" />
              Actions de la variante
            </p>
            <p className="mt-1 text-xs text-white/55">
              {selectedPieceId
                ? `Pièce sélectionnée · ${currentPlayer === "white" ? "Blancs" : "Noirs"}`
                : "Sélectionne une pièce si l’action le demande."}
            </p>
          </div>
          <Badge variant="outline">{visibleActions.length}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleActions.map((action) => {
            const requiresSelection =
              action.availability?.requiresSelection === true;
            const unavailable = disabled || (requiresSelection && !selectedPieceId);
            const loading = submitting === action.id;
            return (
              <Button
                key={action.id}
                type="button"
                disabled={unavailable || Boolean(submitting)}
                onClick={() => {
                  if (actionRequiresTarget(action)) setTargetingAction(action);
                  else void execute(action);
                }}
                className="min-h-11 gap-2 whitespace-normal text-left"
                title={action.hint}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Target className="h-4 w-4" />
                )}
                {action.label}
              </Button>
            );
          })}
        </div>
      </section>

      {targetingAction && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Choisir une cible pour ${targetingAction.label}`}
        >
          <div className="w-full max-w-md rounded-3xl border border-cyan-300/30 bg-slate-950 p-4 text-white shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{targetingAction.label}</h3>
                <p className="text-sm text-white/60">
                  Choisis une case. Les contraintes finales sont revérifiées par
                  le moteur.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setTargetingAction(null)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-8 overflow-hidden rounded-xl border border-white/15">
              {Array.from({ length: 64 }, (_, index) => {
                const row = Math.floor(index / 8);
                const col = index % 8;
                const tile = `${String.fromCharCode(97 + col)}${8 - row}` as Tile;
                const occupied = boardAdapter.getPieceAt(tile) !== null;
                const mode = targetingAction.targeting?.mode ?? "tile";
                const selectable = mode !== "piece" || occupied;
                return (
                  <button
                    key={tile}
                    type="button"
                    disabled={!selectable || Boolean(submitting)}
                    onClick={() => void execute(targetingAction, tile)}
                    className={`aspect-square text-xs font-bold transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                      (row + col) % 2 === 0
                        ? "bg-cyan-100/20"
                        : "bg-indigo-950"
                    } ${
                      selectable
                        ? "hover:bg-fuchsia-500/50"
                        : "cursor-not-allowed opacity-30"
                    }`}
                    aria-label={`Case ${tile}`}
                  >
                    {occupied ? "●" : tile}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
