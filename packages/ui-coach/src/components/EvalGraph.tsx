import type { FC } from "react";
import type { MoveBadgeQuality } from "./MoveBadge";

export interface EvalGraphPoint {
  readonly ply: number;
  readonly delta_ep: number;
  readonly quality: MoveBadgeQuality | string;
}

export interface EvalGraphProps {
  readonly points: EvalGraphPoint[];
}

export const EvalGraph: FC<EvalGraphProps> = ({ points }) => {
  if (points.length === 0) {
    return <div className="h-24 w-full rounded-xl bg-slate-900/40" />;
  }

  const width = 560;
  const height = 120;

  const maxPly = Math.max(...points.map((point) => point.ply), 1);
  const minDelta = Math.min(...points.map((point) => point.delta_ep), -0.4);
  const maxDelta = Math.max(...points.map((point) => point.delta_ep), 0.4);

  const path = points
    .map((point, index) => {
      const x = (point.ply / maxPly) * width;
      const y =
        height -
        ((point.delta_ep - minDelta) / (maxDelta - minDelta || 1)) * height;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const qualityColor = (quality: string): string => {
    switch (quality) {
      case "blunder":
        return "#ef4444";
      case "mistake":
        return "#f97316";
      case "inaccuracy":
        return "#facc15";
      case "brilliant":
        return "#8b5cf6";
      case "excellent":
        return "#10b981";
      case "good":
        return "#38bdf8";
      default:
        return "#e2e8f0";
    }
  };

  return (
    <svg
      width={width}
      height={height}
      className="w-full"
      role="img"
      aria-label="Évaluation cumulative"
    >
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth={2} />
      {points.map((point, index) => {
        const x = (point.ply / maxPly) * width;
        const y =
          height -
          ((point.delta_ep - minDelta) / (maxDelta - minDelta || 1)) * height;
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={4}
            fill={qualityColor(point.quality)}
          />
        );
      })}
    </svg>
  );
};
