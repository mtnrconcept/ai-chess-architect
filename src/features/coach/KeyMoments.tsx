import React from "react";

export const KeyMoments: React.FC<{
  items: { ply: number; delta_ep: number; label: string; best: string }[];
  onReplay: (ply: number) => void;
}> = ({ items, onReplay }) => (
  <div className="grid gap-3">
    {items.map((moment, idx) => (
      <div
        key={idx}
        className="flex items-center justify-between rounded-xl bg-white/5 p-3"
      >
        <div>
          <div className="text-sm font-semibold">Moment clé · coup {moment.ply}</div>
          <div className="text-xs opacity-80">
            {moment.label} · ΔEP {moment.delta_ep > 0 ? "+" : ""}
            {moment.delta_ep} · meilleur {moment.best}
          </div>
        </div>
        <button
          className="rounded-lg bg-cyan-500/20 px-3 py-1 hover:bg-cyan-500/30"
          onClick={() => onReplay(moment.ply)}
        >
          Rejouer
        </button>
      </div>
    ))}
  </div>
);
