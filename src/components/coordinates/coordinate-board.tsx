'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiPost } from '@/lib/api-client';
import type { LocationResult } from '@/lib/coordinates/locations';
import type { CoordinateBoard as BoardData } from '@/lib/coordinates/state';

type Slot = BoardData['locations'][number]['north'];

function FragmentRow({ side, slot }: { side: 'North' | 'South'; slot: Slot }) {
  return (
    <li className="flex min-h-16 flex-col gap-1 border border-border p-3">
      <span className="text-xs text-muted-foreground uppercase">
        {side} · {slot.id}
      </span>
      {slot.held ? (
        <>
          <span className="font-mono text-xl font-semibold break-all">{slot.value}</span>
          {slot.from !== null && (
            <span className="text-xs text-muted-foreground">from #{slot.from}</span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">🔒 Locked</span>
      )}
    </li>
  );
}

// docs/12. Once both halves are held, the team names the place for bonus points, once.
function LocationAnswer({ position, points }: { position: number; points: number }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !answer.trim()) return;
    setPending(true);
    setMessage('');
    try {
      const res = await apiPost('/api/coordinates/locations', { position, answer });
      if (!res.ok) {
        if (res.status !== 401) setMessage('Signal interference, try again.');
        return;
      }
      const out = (await res.json()) as LocationResult;
      const text: Record<LocationResult['result'], string> = {
        correct: `Correct. +${points}`,
        wrong: 'Not that place. Check the coordinates again.',
        already_answered: 'Your team has already named this place.',
        locked: 'Hold both fragments of this location first.',
        rate_limited: 'Too many tries. Wait a minute.',
        closed: 'Submissions are closed.',
      };
      setMessage(text[out.result]);
      if (out.result === 'correct' || out.result === 'already_answered') router.refresh();
    } catch {
      setMessage("Connection lost. Nothing was sent, so try again when you're back.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2">
      <label className="text-sm font-semibold" htmlFor={`place-${position}`}>
        Where is it? Name the place for +{points}
      </label>
      <div className="flex gap-2">
        <input
          id={`place-${position}`}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="City or place"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-secondary px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
        >
          Check
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}

// docs/11. Three locations, each rebuilt from a North and a South fragment. Only fragments this
// team has earned arrive here. A location shows its text once both halves are held; fragment n also
// comes from Main Question beacon n (docs/12).
export function CoordinateBoard({ board }: { board: BoardData }) {
  const held = board.fragments.length;
  const done = board.locations.filter((l) => l.reconstructed).length;
  return (
    <div className="panel-notch flex flex-col gap-4 border border-border bg-card p-4">
      <p>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {held}/{board.slots}
        </span>{' '}
        <span className="text-muted-foreground">fragments held</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Each location needs its North and South fragment. Solve the questions that carry them, or
        find the matching beacon flag in the Main Question. Then name the place for bonus points.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {board.locations.map((loc) => (
          <section key={loc.position} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Location {loc.position} · {loc.reconstructed ? 'Reconstructed ✓' : 'Incomplete'}
            </h3>
            <ol className="flex flex-col gap-2" aria-label={`Location ${loc.position} fragments`}>
              <FragmentRow side="North" slot={loc.north} />
              <FragmentRow side="South" slot={loc.south} />
            </ol>
            {loc.reconstructed && loc.text && (
              <div className="flex flex-col gap-1 border-l-2 border-ring pl-3">
                {loc.label && <span className="font-semibold uppercase">{loc.label}</span>}
                <span className="font-mono whitespace-pre-line">{loc.text}</span>
              </div>
            )}
            {loc.reconstructed && !loc.answered && (
              <LocationAnswer position={loc.position} points={board.locationPoints} />
            )}
            {loc.answered && <p className="text-sm text-success">✓ Place named</p>}
          </section>
        ))}
      </div>

      {done === board.locations.length && (
        <p className="text-success" role="status">
          ✓ All three locations reconstructed.
        </p>
      )}
    </div>
  );
}
