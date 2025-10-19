import type { FC } from "react";
import type { MoveBadgeQuality } from "./MoveBadge";

export interface KeyMomentItem {
  readonly ply: number;
  readonly delta_ep: number;
  readonly label: MoveBadgeQuality | string;
  readonly best: string;
}

export interface KeyMomentsProps {
  readonly items: KeyMomentItem[];
  readonly onReplay: (ply: number) => void;
}

export const KeyMoments: FC<KeyMomentsProps> = ({ items, onReplay }) => (
  <div className="grid gap-3">
    {items.map((item) => (
      <div
        key={item.ply}
        className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/40 p-4"
      >
        <div>
          <div className="text-sm font-semibold text-slate-100">
            Moment clé · coup {item.ply}
          </div>
          <div className="text-xs text-slate-300">
            {item.label} · ΔEP {item.delta_ep > 0 ? "+" : ""}
            {item.delta_ep.toFixed(2)} · meilleur {item.best}
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30"
          onClick={() => onReplay(item.ply)}
        >
          Rejouer
        </button>
      </div>
    ))}
  </div>
);
