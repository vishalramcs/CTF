'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api-client';

// Hint text is only ever fetched on request, so unrevealed hints aren't in the page.
export function Hints({ number, count }: { number: number; count: number }) {
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);

  async function reveal(index: number) {
    setFailed(false);
    const res = await apiPost(`/api/challenges/${number}/hints`, { index }).catch(() => null);
    if (!res?.ok) return setFailed(true);
    const { hint } = await res.json();
    setRevealed((current) => ({ ...current, [index]: hint }));
  }

  if (count === 0) return null;
  return (
    <section aria-labelledby="hints" className="flex flex-col gap-2">
      <h2 id="hints" className="font-heading text-2xl font-bold uppercase">
        Hints
      </h2>
      {Array.from({ length: count }, (_, i) => i + 1).map((index) =>
        revealed[index] ? (
          <p key={index} className="whitespace-pre-wrap">
            <span className="text-muted-foreground">Hint {index}: </span>
            {revealed[index]}
          </p>
        ) : (
          <Button
            key={index}
            variant="outline"
            className="min-h-11 self-start"
            onClick={() => void reveal(index)}
          >
            Reveal hint {index}
          </Button>
        ),
      )}
      {failed && <p role="status">Signal interference, try again.</p>}
    </section>
  );
}
