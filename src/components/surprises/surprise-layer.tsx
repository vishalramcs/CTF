'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { usePoll } from '@/components/participant/use-poll';
import { MorseSpider } from '@/components/surprises/morse-spider';
import { SurpriseDialog } from '@/components/surprises/surprise-dialog';

type Summary = { kind: string; discovered: boolean; completed: boolean };

const KEY = 'spidey:dismissed';
const FOCUS = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

// Mounted in the team layout so every team page can show them. The icons only appear when the
// server lists the surprise, and say nothing about its content.
export function SurpriseLayer() {
  const router = useRouter();
  const [list, setList] = useState<Summary[]>([]);
  const [signal, setSignal] = useState<number[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [open, setOpen] = useState<string | null>(null);

  usePoll(() => {
    fetch('/api/surprises')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) return;
        setList(body.surprises);
        // Only a changed word restarts the blinking; a poll must not cut it off mid-letter.
        setSignal((old) => {
          const next: number[] = body.signal ?? [];
          return old.join() === next.join() ? old : next;
        });
      })
      .catch(() => {});
  });

  const shown = (kind: string) => list.some((s) => s.kind === kind && !s.completed);

  function dismiss(kind: string) {
    const next = [...dismissed, kind];
    setDismissed(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <>
      <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3">
        {shown('spidey_signal') && !dismissed.includes('spidey_signal') && (
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => dismiss('spidey_signal')}
              aria-label="Hide the signal for this session"
              className={`min-h-11 min-w-11 rounded-full text-muted-foreground ${FOCUS}`}
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => setOpen('spidey_signal')}
              aria-label="Spidey Signal detected. Open it."
              className={`flex size-20 items-center justify-center rounded-full border border-ring bg-card ${FOCUS}`}
            >
              <MorseSpider timeline={signal} className="size-16" />
            </button>
          </div>
        )}
      </div>
      {open && (
        <SurpriseDialog
          key={open}
          kind={open}
          signal={signal}
          onClose={() => setOpen(null)}
          onDone={() => {
            setList((l) => l.map((s) => (s.kind === open ? { ...s, completed: true } : s)));
            router.refresh();
          }}
        />
      )}
    </>
  );
}
