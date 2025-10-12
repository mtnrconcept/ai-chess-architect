import type { FC } from 'react';

export interface AccuracyGaugesProps {
  readonly white: number;
  readonly black: number;
}

const Gauge: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-slate-700">
      <span className="text-lg font-semibold text-white">{value.toFixed(1)}</span>
      <span className="absolute bottom-2 text-xs uppercase tracking-wide text-slate-400">ACC</span>
    </div>
    <p className="text-sm text-slate-300">{label}</p>
  </div>
);

export const AccuracyGauges: FC<AccuracyGaugesProps> = ({ white, black }) => (
  <section className="flex items-center justify-around gap-6" aria-label="Accuracy gauges">
    <Gauge label="White" value={white} />
    <Gauge label="Black" value={black} />
  </section>
);
