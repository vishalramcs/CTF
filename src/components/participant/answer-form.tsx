'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api-client';

type Outcome = {
  result: string;
  points?: number;
  attemptsLeft?: number;
  retryAfter?: number;
  winner?: boolean;
  [key: string]: unknown;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// One answer box for the final location and surprises. Both endpoints share these result names; the copy
// follows Design Brief §9. `onCorrect` gets the full response .
export function AnswerForm({
  path,
  label,
  submitLabel,
  onCorrect,
}: {
  path: string;
  label: string;
  submitLabel: string;
  onCorrect: (outcome: Outcome) => void;
}) {
  const id = useId();
  const [answer, setAnswer] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [retryIn, setRetryIn] = useState(0);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn(retryIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  function apply(o: Outcome) {
    setMessage('');
    switch (o.result) {
      case 'correct':
        setMessage(
          o.points === undefined ? 'Location confirmed.' : `Signal recovered. +${o.points}`,
        );
        return onCorrect(o);
      case 'wrong':
        return setMessage(
          `Not the signal. ${o.attemptsLeft} ${o.attemptsLeft === 1 ? 'try' : 'tries'} left this minute.`,
        );
      case 'rate_limited':
        return setRetryIn(o.retryAfter ?? 1);
      case 'already_completed':
        return setMessage('Already done. Nothing more to claim here.');
      case 'unavailable':
        return setMessage('This one has closed.');
      case 'closed':
        return setMessage('Submissions are closed right now.');
      default:
        return setMessage('Something went wrong. Try again.');
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || retryIn > 0 || !answer.trim()) return;
    setPending(true);
    try {
      const res = await apiPost(path, { answer });
      if (res.status === 401) return; // The session guard takes over.
      if (!res.ok) throw new Error('bad');
      apply((await res.json()) as Outcome);
    } catch {
      setMessage('Connection lost. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={200}
          className="h-11 min-w-0 flex-1 rounded-sm border border-input bg-secondary px-3 font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <Button type="submit" disabled={pending || retryIn > 0} className="h-11 px-4">
          {retryIn > 0 ? `Retry in ${clock(retryIn)}` : submitLabel}
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm">
        {retryIn > 0 ? `Spider-sense overload. Retry in ${clock(retryIn)}.` : message}
      </p>
    </form>
  );
}
