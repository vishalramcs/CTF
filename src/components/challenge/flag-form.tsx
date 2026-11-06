'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api-client';
import type { SubmitResult } from '@/lib/scoring/submit';

type Solved = {
  points: number;
  fragment: string | null;
  orderClue: string | null;
  finalCoordinates: { label: string; value: string }[] | null;
  fragments: { id: string; value: string }[] | null;
};

function SolvedPanel({ points, fragment, orderClue, finalCoordinates, fragments }: Solved) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-success p-4">
      <p className="font-semibold text-success">
        ✓{' '}
        {fragments
          ? `All six fragments recovered. +${points}`
          : fragment
            ? `Signal fragment recovered. +${points}`
            : `Flag accepted (+${points})`}
      </p>
      {fragment && <p className="font-mono text-5xl font-semibold">{fragment}</p>}
      {fragments && (
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {fragments.map((f) => (
            <li key={f.id} className="font-mono">
              <span className="mr-2 text-sm text-muted-foreground">{f.id}</span>
              {f.value}
            </li>
          ))}
        </ul>
      )}
      {orderClue && <p>{orderClue}</p>}
      {finalCoordinates && finalCoordinates.length > 0 && (
        <ul className="flex flex-col gap-1">
          {finalCoordinates.map((c, i) => (
            <li key={i} className="font-mono text-2xl font-semibold">
              {c.label && <span className="mr-2 text-sm text-muted-foreground">{c.label}</span>}
              {c.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// `solved` comes from the server once the team has solved this, and only then.
export function FlagForm({
  number,
  prefix,
  solved,
}: {
  number: number;
  prefix: string;
  solved: Solved | null;
}) {
  const router = useRouter();
  const [flag, setFlag] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [justSolved, setJustSolved] = useState<Solved | null>(null);
  const [retryIn, setRetryIn] = useState(0);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn(retryIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  function apply(outcome: SubmitResult) {
    switch (outcome.result) {
      case 'correct':
        setJustSolved({
          points: outcome.points,
          fragment: outcome.fragment ?? null,
          orderClue: outcome.orderClue ?? null,
          finalCoordinates: outcome.finalCoordinates ?? null,
          fragments: outcome.fragments ?? null,
        });
        setMessage('');
        return router.refresh();
      case 'wrong':
        setAttempt((n) => n + 1);
        return setMessage(
          `Not the signal. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? 'try' : 'tries'} left this minute.`,
        );
      case 'rate_limited':
        setMessage('');
        return setRetryIn(outcome.retryAfter);
      case 'already_solved':
        setMessage('Your team has already solved this one.');
        return router.refresh();
      case 'closed':
        setMessage('Submissions are closed.');
        return router.refresh();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || retryIn > 0) return;
    setPending(true);
    try {
      const res = await apiPost(`/api/challenges/${number}/submit`, { flag });
      if (res.ok) apply(await res.json());
      else if (res.status !== 401) setMessage('Signal interference, try again.');
    } catch {
      setMessage("Connection lost. Nothing was sent, so try again when you're back.");
    } finally {
      setPending(false);
    }
  }

  const shown = solved ?? justSolved;
  const limited = retryIn > 0;
  return (
    <section aria-labelledby="submit" className="flex flex-col gap-2">
      <h2 id="submit" className="font-heading text-2xl font-bold uppercase">
        Submit
      </h2>
      {!shown && (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 sm:flex-row">
          <input
            key={attempt}
            aria-label="Flag"
            autoComplete="off"
            spellCheck={false}
            placeholder={`${prefix}{...}`}
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            className={`min-h-11 flex-1 rounded-md border bg-secondary px-3 font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              attempt > 0 ? 'border-destructive motion-safe:animate-[shake_300ms]' : 'border-input'
            }`}
          />
          <Button
            type="submit"
            className="min-h-11 px-6"
            disabled={pending || limited || flag.trim() === ''}
          >
            {limited ? `Retry in ${clock(retryIn)}` : pending ? 'Sending…' : 'Submit'}
          </Button>
        </form>
      )}
      <div role="status">
        {shown && <SolvedPanel {...shown} />}
        {limited && !shown && (
          <p className="text-warn">Spider-sense overload. Retry in {clock(retryIn)}.</p>
        )}
        {message && !limited && !shown && <p>{message}</p>}
      </div>
    </section>
  );
}
