'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { takeHangingHero } from '@/components/shared/hanging-hero';
import { Button } from '@/components/ui/button';
import { playSwing, waitForPath } from '@/lib/swing/controller';

const inputClass =
  'mt-1 h-11 w-full rounded-md border border-input bg-secondary px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring';

export function LoginForm({
  endpoint,
  next,
  notice,
  usernameLabel = 'Username',
  compact = false,
  cinematic = false,
}: {
  endpoint: string;
  next: string;
  notice?: string;
  usernameLabel?: string;
  compact?: boolean;
  /** Team login: Spider-Man drops in once the server has accepted the login. */
  cinematic?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
        }),
      });
      if (res.ok) {
        if (cinematic) {
          // Only after the server accepted it. Logout is a full load, so this document holds nothing
          // from an earlier session and an in-app navigation is safe; the page swaps under the backdrop.
          const target = new URL(next, window.location.origin).pathname;
          const played = playSwing('login', {
            origin: takeHangingHero(),
            onCover: () => router.push(next),
            ready: waitForPath(target),
          });
          if (played) return;
        }
        // A full load, so nothing cached from a previous session survives.
        window.location.assign(next);
        return;
      }
      const body = await res.json();
      setError(body.error.message);
    } catch {
      setError('Connection lost. Check your network and try again.');
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className={compact ? 'space-y-3' : 'space-y-4'}>
      {notice && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <label className="block text-sm font-medium">
        {usernameLabel}
        <input
          name="username"
          required
          maxLength={64}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={compact ? inputClass.replace('h-11', 'h-10') : inputClass}
        />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          maxLength={256}
          autoComplete="current-password"
          className={compact ? inputClass.replace('h-11', 'h-10') : inputClass}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className={compact ? 'h-10 w-full text-base' : 'h-11 w-full text-base'}
      >
        {pending ? 'Checking…' : 'Log in'}
      </Button>
    </form>
  );
}
