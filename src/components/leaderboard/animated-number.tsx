'use client';

import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { formatPoints } from '@/components/leaderboard/format';

// Counts to the server's value. React renders the real number, so the text is right with no script.
export function AnimatedNumber({ value }: { value: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    const from = shown.current;
    shown.current = value;
    if (from === value || reduce) return;
    const controls = animate(from, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (n) => {
        if (el.current) el.current.textContent = formatPoints(n);
      },
      onComplete: () => {
        if (el.current) el.current.textContent = formatPoints(value);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <span ref={el}>{formatPoints(value)}</span>;
}

// A brief +100 that rises from a score. Decorative: the score itself carries the value.
export function PointsFloat({ points, large }: { points: number; large?: boolean }) {
  const reduce = useReducedMotion();
  if (reduce || points === 0) return null;
  return (
    <span
      aria-hidden
      className={`points-float pointer-events-none absolute right-2 -top-1 font-bold tabular-nums ${
        points > 0 ? 'text-[#7da7ff]' : 'text-[#ff6b70]'
      } ${large ? 'text-3xl' : 'text-sm'}`}
    >
      {points > 0 ? '+' : ''}
      {formatPoints(points)}
    </span>
  );
}
