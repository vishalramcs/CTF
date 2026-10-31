'use client';

import { useEffect, useState } from 'react';

// App Flow §5: timers use the server's clock, not the laptop's.
export function Countdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let offset = 0;
    const sentAt = Date.now();
    void fetch('/api/time')
      .then(async (res) => {
        if (res.ok) offset = (await res.json()).serverTime - (sentAt + Date.now()) / 2;
      })
      .catch(() => {});
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now() - offset) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (remaining === null) return null;
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  return (
    <span className="font-mono tabular-nums">
      {minutes}:{seconds}
    </span>
  );
}
