'use client';

import { useState } from 'react';

import { usePoll } from '@/components/participant/use-poll';
import { formatDateTimeIST } from '@/lib/participant/time';

type Item = { message: string; createdAt: string };

// Messages are plain text on purpose: React escapes them, nothing is parsed as HTML.
export function Announcements({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);

  usePoll(() => {
    fetch('/api/announcements')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setItems(body.announcements))
      .catch(() => {});
  });

  return (
    <section aria-labelledby="news" className="flex flex-col gap-3">
      <h2 id="news" className="font-heading text-2xl font-bold uppercase">
        Announcements
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nothing new from the organisers.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {items.map((a) => (
            <li key={a.createdAt + a.message} className="border-l-2 border-primary bg-card p-3">
              <p className="whitespace-pre-wrap">{a.message}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {formatDateTimeIST(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
