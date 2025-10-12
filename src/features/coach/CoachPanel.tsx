import React from "react";

type CoachComment = {
  headline: string;
  why_bad_or_good: string;
  what_to_learn: string[];
  best_line_explained: string;
};

export const CoachPanel: React.FC<{ comment?: CoachComment | null }> = ({ comment }) => {
  if (!comment) {
    return (
      <div className="text-sm opacity-60">
        Déplace le curseur pour le commentaire du coach.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="font-semibold">{comment.headline}</div>
      <div className="text-sm opacity-90">{comment.why_bad_or_good}</div>
      <div className="text-sm">
        <span className="opacity-75">À retenir:</span>{" "}
        {comment.what_to_learn.join(" · ")}
      </div>
      <div className="text-sm opacity-90">
        Ligne conseillée: {comment.best_line_explained}
      </div>
    </div>
  );
};
