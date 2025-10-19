import type { FC } from "react";

export interface CoachComment {
  readonly headline: string;
  readonly why_bad_or_good: string;
  readonly what_to_learn: string[];
  readonly best_line_explained: string;
}

export interface CoachPanelProps {
  readonly comment: CoachComment | null;
}

export const CoachPanel: FC<CoachPanelProps> = ({ comment }) => {
  if (!comment) {
    return (
      <div className="text-sm text-slate-400">
        Déplace le curseur pour obtenir le commentaire du coach.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-100">
      <p className="text-base font-semibold text-slate-50">
        {comment.headline}
      </p>
      <p className="leading-relaxed text-slate-200">
        {comment.why_bad_or_good}
      </p>
      <p>
        <span className="font-semibold text-slate-300">À retenir&nbsp;:</span>{" "}
        {comment.what_to_learn.join(" · ")}
      </p>
      <p className="text-slate-300">
        Ligne conseillée&nbsp;: {comment.best_line_explained}
      </p>
    </div>
  );
};
