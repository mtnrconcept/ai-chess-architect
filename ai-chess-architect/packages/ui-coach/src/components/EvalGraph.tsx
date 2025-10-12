import React from 'react';

export const EvalGraph: React.FC<{ points: { ply: number; delta_ep: number; quality: string }[] }> = ({
  points
}) => {
  // mini sparkline SVG colorée par qualité
  const w = 560;
  const h = 120;
  const xs = points.map((p) => p.ply);
  const ys = points.map((p) => p.delta_ep);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, -0.4);
  const yMax = Math.max(...ys, 0.4);
  const path = points
    .map((p, i) => {
      const x = (p.ply / xMax) * w;
      const y = h - ((p.delta_ep - yMin) / (yMax - yMin)) * h;
      return `${i ? 'L' : 'M'}${x},${y}`;
    })
    .join(' ');
  const color = (q: string) =>
    q === 'blunder'
      ? '#ff4d4f'
      : q === 'mistake'
        ? '#faad14'
        : q === 'inaccuracy'
          ? '#fadb14'
          : '#52c41a';

  return (
    <svg width={w} height={h} style={{ borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
      <path d={path} fill="none" stroke="#8bd5ff" strokeWidth={2} />
      {points.map((p, i) => {
        const x = (p.ply / xMax) * w;
        const y = h - ((p.delta_ep - yMin) / (yMax - yMin)) * h;
        return <circle key={i} cx={x} cy={y} r={3} fill={color(p.quality)} />;
      })}
    </svg>
  );
};
