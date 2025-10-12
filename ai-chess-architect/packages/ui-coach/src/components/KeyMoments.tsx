import React from 'react';

export const KeyMoments: React.FC<{
  items: { ply: number; delta_ep: number; label: string; best: string }[];
  onReplay: (ply: number) => void;
}> = ({ items, onReplay }) => (
  <div className="grid gap-3">
    {items.map((k, i) => (
      <div key={i} className="rounded-xl p-3 bg-white/5 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Moment clé · coup {k.ply}</div>
          <div className="text-xs opacity-80">
            {k.label} · ΔEP {k.delta_ep > 0 ? '+' : ''}
            {k.delta_ep} · meilleur {k.best}
          </div>
        </div>
        <button
          className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30"
          onClick={() => onReplay(k.ply)}
        >
          Rejouer
        </button>
      </div>
    ))}
  </div>
);
