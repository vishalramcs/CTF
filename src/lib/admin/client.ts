import { apiPost, fetchSession } from '@/lib/api-client';

export type SendResult<T> = { ok: true; data: T } | { ok: false; message: string };

// apiPost only speaks POST. Its CSRF token is private, so PATCH and DELETE fetch their own.
async function sendWithToken(method: string, path: string, body: unknown): Promise<Response> {
  const session = await fetchSession();
  if (!session.ok) return session;
  const { csrf } = await session.json();
  return fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(body ?? {}),
  });
}

export async function send<T = unknown>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<SendResult<T>> {
  try {
    const res =
      method === 'POST' ? await apiPost(path, body) : await sendWithToken(method, path, body);
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };
    return { ok: false, message: data.error?.message ?? 'Signal interference, try again' };
  } catch {
    return { ok: false, message: 'Connection lost. Check your network and try again.' };
  }
}
