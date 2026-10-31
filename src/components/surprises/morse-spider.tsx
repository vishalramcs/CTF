'use client';

import { useEffect, useState } from 'react';

// Our own spider glyph. It stays lit for the "on" part of each [on, off, ...] pair, and repeats.
export function MorseSpider({ timeline, className }: { timeline: number[]; className: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (timeline.length === 0) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      setOn(step % 2 === 0);
      timer = setTimeout(next, timeline[step]);
      step = (step + 1) % timeline.length;
    };
    next();
    return () => clearTimeout(timer);
  }, [timeline]);

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden fill="none">
      <g stroke={on ? '#ff4a50' : '#3a4257'} strokeWidth="2" strokeLinecap="round">
        <path d="M32 32 12 14M32 32 6 30M32 32 10 50M32 32 20 60M32 32 52 14M32 32 58 30M32 32 54 50M32 32 44 60" />
      </g>
      <ellipse cx="32" cy="38" rx="10" ry="14" fill={on ? '#ff4a50' : '#1f2840'} />
      <circle cx="32" cy="22" r="7" fill={on ? '#ff4a50' : '#1f2840'} />
    </svg>
  );
}
