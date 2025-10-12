import type { FC } from 'react';
import { EvaluationGraph, type EvaluationGraphPoint } from './EvaluationGraph';
import { KeyMomentsTimeline, type KeyMomentItem } from './KeyMomentsTimeline';
import { CoachInsightsPanel, type CoachInsight } from './CoachInsightsPanel';
import { AccuracyGauges } from './AccuracyGauges';
import { ThemesChips } from './ThemesChips';

export interface ReportViewerProps {
  readonly summaryMarkdown: string;
  readonly accuracy: { white: number; black: number };
  readonly evaluationSeries: EvaluationGraphPoint[];
  readonly keyMoments: KeyMomentItem[];
  readonly insights: CoachInsight[];
  readonly themes: string[];
}

export const ReportViewer: FC<ReportViewerProps> = ({
  summaryMarkdown,
  accuracy,
  evaluationSeries,
  keyMoments,
  insights,
  themes,
}) => (
  <section className="space-y-8 rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-slate-100">
    <header className="space-y-4">
      <h2 className="text-xl font-semibold">Game Review</h2>
      <AccuracyGauges white={accuracy.white} black={accuracy.black} />
      <EvaluationGraph points={evaluationSeries} />
    </header>
    <article className="space-y-3 text-sm leading-relaxed text-slate-200">
      {summaryMarkdown.split('\n').map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </article>
    <section>
      <h3 className="text-lg font-semibold">Key moments</h3>
      <KeyMomentsTimeline items={keyMoments} />
    </section>
    <section>
      <h3 className="text-lg font-semibold">Themes</h3>
      <ThemesChips themes={themes} />
    </section>
    <section>
      <h3 className="text-lg font-semibold">Coach insights</h3>
      <CoachInsightsPanel insights={insights} />
    </section>
    <footer>
      <button type="button" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900">
        Rejouer les moments clés
      </button>
    </footer>
  </section>
);
