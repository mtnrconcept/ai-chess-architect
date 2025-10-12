import type { FC } from 'react';

export type MoveBadgeQuality =
  | 'brilliant'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'book'
  | 'forced';

const QUALITY_LABELS: Record<MoveBadgeQuality, string> = {
  brilliant: 'Brilliant',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  book: 'Book',
  forced: 'Forced',
};

const QUALITY_CLASSES: Record<MoveBadgeQuality, string> = {
  brilliant: 'bg-indigo-500 text-white',
  excellent: 'bg-emerald-500 text-white',
  good: 'bg-slate-600 text-white',
  inaccuracy: 'bg-amber-500 text-black',
  mistake: 'bg-orange-600 text-white',
  blunder: 'bg-red-600 text-white',
  book: 'bg-slate-500 text-white',
  forced: 'bg-sky-500 text-white',
};

export interface MoveBadgeProps {
  readonly quality: MoveBadgeQuality;
}

export const MoveBadge: FC<MoveBadgeProps> = ({ quality }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${QUALITY_CLASSES[quality]}`} role="status">
    {QUALITY_LABELS[quality]}
  </span>
);
