'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api-client';
import type { ClaimResult } from '@/lib/coordinates/claim';

// Opens after a correct flag on a question that hides its coordinate in the flag. The value only
// comes back from the server once the entry is right, and the board updates from there.
export function CoordinateEntry({ number }: { number: number }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [retryIn, setRetryIn] = useState(0);
  const [claimed, setClaimed] = useState<string | null>(null);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn(retryIn - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  function apply(outcome: ClaimResult) {
    switch (outcome.result) {
      case 'correct':
        setClaimed(outcome.fragment);
        setMessage('');
        return router.refresh();
      case 'wrong':
        return setMessage(
          `That is not the coordinate. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? 'try' : 'tries'} left this minute.`,
        );
      case 'rate_limited':
        setMessage('');
        return setRetryIn(outcome.retryAfter);
      case 'already_claimed':
        return router.refresh();
      case 'closed':
        return setMessage('Submissions are closed.');
      case 'not_solved':
        return setMessage('Solve the question first.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || retryIn > 0) return;
    setPending(true);
    try {
      const res = await apiPost(`/api/challenges/${number}/coordinate`, { value });
      if (res.ok) apply(await res.json());
      else if (res.status !== 401) setMessage('Signal interference, try again.');
    } catch {
      setMessage("Connection lost. Nothing was sent, so try again when you're back.");
    } finally {
      setPending(false);
    }
  }

  if (claimed) {
    return (
      <div role="status" className="flex flex-col gap-1">
        <p className="font-semibold text-success">✓ Coordinate added to your board.</p>
        <p className="font-mono text-3xl font-semibold">{claimed}</p>
      </div>
    );
  }

  const limited = retryIn > 0;
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-2 border-t border-border pt-3"
    >
      <label htmlFor="coordinate-entry" className="font-semibold">
        Your flag hides a coordinate. Enter it to add it to your board.
      </label>
      <p id="coordinate-format" className="font-mono text-sm text-muted-foreground">
        North: N*^^.^^^^ &nbsp; South: S*^^.^^^^
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="coordinate-entry"
          aria-describedby="coordinate-format"
          autoComplete="off"
          spellCheck={false}
          placeholder="N*^^.^^^^"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 flex-1 rounded-md border border-input bg-secondary px-3 font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <Button
          type="submit"
          className="min-h-11 px-6"
          disabled={pending || limited || value.trim() === ''}
        >
          {limited ? `Retry in ${retryIn}s` : pending ? 'Sending…' : 'Enter'}
        </Button>
      </div>
      <p role="status" className="text-sm">
        {limited ? `Spider-sense overload. Retry in ${retryIn}s.` : message}
      </p>
    </form>
  );
}
