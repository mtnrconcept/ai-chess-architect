import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type NeonBackgroundProps = {
  children: ReactNode;
  contentClassName?: string;
};

const NeonBackground = ({ children, contentClassName }: NeonBackgroundProps) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020312] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[580px] w-[780px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute left-[12%] top-1/3 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-[120px]" />
        <div className="absolute right-[10%] top-1/4 h-72 w-72 rounded-full bg-amber-400/15 blur-[120px]" />
      </div>
      <div className={cn('relative z-10 flex min-h-screen flex-col', contentClassName)}>{children}</div>
    </div>
  );
};

export default NeonBackground;
