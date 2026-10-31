'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { send, type SendResult } from '@/lib/admin/client';

// Runs one admin request, tracks pending and error, and refreshes the server data on success.
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function run<T = unknown>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<SendResult<T>> {
    setPending(true);
    setError(undefined);
    const result = await send<T>(method, path, body);
    setPending(false);
    if (result.ok) router.refresh();
    else setError(result.message);
    return result;
  }

  return { run, pending, error };
}
