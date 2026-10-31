'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';

const inputClass =
  'mt-1 h-11 w-full rounded-md border border-input bg-secondary px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring';

export function LoginForm({
  endpoint,
  next,
  notice,
  usernameLabel = 'Username',
}: {
  endpoint: string;
  next: string;
  notice?: string;
  usernameLabel?: string;
}) {
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
    <form onSubmit={onSubmit} className="space-y-4">
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
          className={inputClass}
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
          className={inputClass}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full text-base">
        {pending ? 'Checking…' : 'Log in'}
      </Button>
    </form>
  );
}
