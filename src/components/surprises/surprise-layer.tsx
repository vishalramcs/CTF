'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { usePoll } from '@/components/participant/use-poll';
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

function Signal() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden fill="none" stroke="#5c8dff">
      <circle cx="16" cy="16" r="3" fill="#5c8dff" />
      <circle cx="16" cy="16" r="8" strokeOpacity="0.7" />
      <circle cx="16" cy="16" r="13" strokeOpacity="0.4" />
    </svg>
  );
}

function Lens() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden fill="none">
      <rect x="3" y="8" width="26" height="16" rx="3" stroke="#e8ecf6" />
      <circle cx="16" cy="16" r="4" fill="#e2232a" />
    </svg>
  );
}

function Mutant() {
  return (
    <svg viewBox="0 0 64 64" className="size-14" aria-hidden fill="none">
      <g stroke="#9b5cff" strokeWidth="2" strokeLinecap="round">
        <path d="M32 32 12 14M32 32 6 30M32 32 10 50M32 32 20 60M32 32 52 14M32 32 58 30M32 32 54 50M32 32 44 60" />
      </g>
      <ellipse cx="32" cy="38" rx="10" ry="14" fill="#6a2fd0" />
      <circle cx="32" cy="22" r="7" fill="#9b5cff" />
      <circle cx="29" cy="21" r="1.6" fill="#ff4a50" />
      <circle cx="35" cy="21" r="1.6" fill="#ff4a50" />
    </svg>
  );
}

// Mounted in the team layout so every team page can show them. The icons only appear when the
// server lists the surprise, and say nothing about its content.
export function SurpriseLayer() {
  const router = useRouter();
  const [list, setList] = useState<Summary[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [open, setOpen] = useState<string | null>(null);

  usePoll(() => {
    fetch('/api/surprises')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body && setList(body.surprises))
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
        {shown('spider_mutation') && (
          <div className="mutant-crawl">
            <button
              type="button"
              onClick={() => setOpen('spider_mutation')}
              aria-label="Something strange is moving. Investigate."
              className={`pointer-events-auto flex size-16 items-center justify-center rounded-full ${FOCUS}`}
            >
              <Mutant />
            </button>
          </div>
        )}
        {shown('flashy_spider') && (
          <button
            type="button"
            onClick={() => setOpen('flashy_spider')}
            aria-label="A strange recording is available. Open it."
            className={`pointer-events-auto flex size-12 items-center justify-center rounded-full border border-border bg-card ${FOCUS}`}
          >
            <Lens />
          </button>
        )}
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
              className={`signal-pulse flex size-12 items-center justify-center rounded-full border border-ring bg-card ${FOCUS}`}
            >
              <Signal />
            </button>
          </div>
        )}
      </div>
      {open && (
        <SurpriseDialog
          key={open}
          kind={open}
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
