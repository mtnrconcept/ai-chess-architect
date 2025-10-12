import type { FC } from 'react';
import { MoveBadge, type MoveBadgeQuality } from './MoveBadge';

export interface CoachInsight {
  readonly ply: number;
  readonly san: string;
  readonly delta: number;
  readonly quality: MoveBadgeQuality;
  readonly explanation?: {
    readonly headline: string;
    readonly whyBadOrGood: string;
    readonly whatToLearn: string[];
    readonly bestLineExplained: string;
  };
}

export interface CoachInsightsPanelProps {
  readonly insights: CoachInsight[];
}

export const CoachInsightsPanel: FC<CoachInsightsPanelProps> = ({ insights }) => (
  <div className="space-y-4" aria-label="Coach insights">
    {insights.map((insight) => (
      <article key={insight.ply} className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Ply {insight.ply}</h3>
            <p className="text-xs text-slate-300">Move {insight.san}</p>
          </div>
          <MoveBadge quality={insight.quality} />
        </header>
        <p className="mt-3 text-sm text-slate-200">Δ {insight.delta} cp</p>
        {insight.explanation ? (
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p className="font-semibold text-white">{insight.explanation.headline}</p>
            <p>{insight.explanation.whyBadOrGood}</p>
            <ul className="list-disc space-y-1 pl-5 text-slate-200">
              {insight.explanation.whatToLearn.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="italic text-slate-400">{insight.explanation.bestLineExplained}</p>
          </div>
        ) : null}
      </article>
    ))}
  </div>
);
