import React from 'react';

export const MoveBadge: React.FC<{ quality: string }> = ({ quality }) => {
  const map: Record<string, string> = {
    blunder: 'bg-red-500/20 text-red-200',
    mistake: 'bg-amber-500/20 text-amber-200',
    inaccuracy: 'bg-yellow-500/20 text-yellow-200',
    good: 'bg-emerald-500/20 text-emerald-200',
    excellent: 'bg-cyan-500/20 text-cyan-200',
    best: 'bg-blue-500/20 text-blue-200',
    brilliant: 'bg-fuchsia-500/20 text-fuchsia-200',
    great: 'bg-indigo-500/20 text-indigo-200'
  };
  return (
    <span className={`px-2 py-1 rounded-md text-xs ${map[quality] || 'bg-slate-500/20 text-slate-200'}`}>
      {quality}
    </span>
  );
};
