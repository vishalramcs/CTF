'use client';

import { useEffect, useRef } from 'react';

// Runs `fn` now, every 30 s, and when the tab is focused again.
export function usePoll(fn: () => void, ms = 30_000) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    run();
    const timer = setInterval(run, ms);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [ms]);
}
