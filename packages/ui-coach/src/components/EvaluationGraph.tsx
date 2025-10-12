import type { FC } from 'react';

export interface EvaluationGraphPoint {
  readonly ply: number;
  readonly evaluation: number;
}

export interface EvaluationGraphProps {
  readonly points: EvaluationGraphPoint[];
}

export const EvaluationGraph: FC<EvaluationGraphProps> = ({ points }) => {
  const maxAbs = Math.max(100, ...points.map((point) => Math.abs(point.evaluation)));
  const scaleY = (value: number): number => 50 - (value / maxAbs) * 50;

  return (
    <svg className="h-32 w-full" viewBox="0 0 100 50" role="img" aria-label="Evaluation graph">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        points={points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${scaleY(point.evaluation)}`).join(' ')}
      />
    </svg>
  );
};
