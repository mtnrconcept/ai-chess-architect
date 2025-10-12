import React from "react";

export const EvalGraph: React.FC<{
  points: { ply: number; delta_ep: number; quality: string }[];
}> = ({ points }) => {
  const width = 560;
  const height = 120;
  const xMax = Math.max(...points.map((p) => p.ply), 1);
  const yValues = points.map((p) => p.delta_ep);
  const yMin = Math.min(-0.4, ...yValues);
  const yMax = Math.max(0.4, ...yValues);

  const path = points
    .map((p, idx) => {
      const x = (p.ply / xMax) * width;
      const y = height - ((p.delta_ep - yMin) / (yMax - yMin)) * height;
      return `${idx ? "L" : "M"}${x},${y}`;
    })
    .join(" ");

  const color = (quality: string) =>
    quality === "blunder"
      ? "#ff4d4f"
      : quality === "mistake"
      ? "#faad14"
      : quality === "inaccuracy"
      ? "#fadb14"
      : "#52c41a";

  return (
    <svg
      width={width}
      height={height}
      className="rounded-2xl"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <path d={path} fill="none" stroke="#8bd5ff" strokeWidth={2} />
      {points.map((p, idx) => {
        const x = (p.ply / xMax) * width;
        const y = height - ((p.delta_ep - yMin) / (yMax - yMin)) * height;
        return <circle key={idx} cx={x} cy={y} r={3} fill={color(p.quality)} />;
      })}
    </svg>
  );
};
