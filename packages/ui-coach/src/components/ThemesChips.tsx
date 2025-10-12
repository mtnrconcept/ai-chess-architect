import type { FC } from 'react';

export interface ThemesChipsProps {
  readonly themes: string[];
}

export const ThemesChips: FC<ThemesChipsProps> = ({ themes }) => (
  <div className="flex flex-wrap gap-2" aria-label="Themes">
    {themes.map((theme) => (
      <span key={theme} className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200">
        {theme}
      </span>
    ))}
  </div>
);
