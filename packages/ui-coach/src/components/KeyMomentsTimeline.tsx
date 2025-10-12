import type { FC } from 'react';
import { MoveBadge } from './MoveBadge';

export interface KeyMomentItem {
  readonly ply: number;
  readonly classification: Parameters<typeof MoveBadge>[0]['quality'];
  readonly delta: number;
  readonly description?: string;
}

export interface KeyMomentsTimelineProps {
  readonly items: KeyMomentItem[];
}

export const KeyMomentsTimeline: FC<KeyMomentsTimelineProps> = ({ items }) => (
  <ol className="space-y-4" aria-label="Key moments timeline">
    {items.map((item) => (
      <li key={item.ply} className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold">
          {item.ply}
        </div>
        <div className="flex-1 space-y-1">
          <MoveBadge quality={item.classification} />
          <p className="text-sm text-slate-200">Δ {item.delta} cp</p>
          {item.description ? <p className="text-sm text-slate-300">{item.description}</p> : null}
        </div>
      </li>
    ))}
  </ol>
);
