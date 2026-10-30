// Browser fetch for our API: adds the CSRF header and announces when the session has ended.

export const SESSION_ENDED_EVENT = 'spidey:session-ended';

let csrf: string | undefined;

async function announceIfEnded(res: Response): Promise<void> {
  if (res.status !== 401) return;
  const { reason } = await res.clone().json();
  if (reason) window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: reason }));
}

export async function fetchSession(): Promise<Response> {
  const res = await fetch('/api/auth/session');
  await announceIfEnded(res);
  if (res.ok) csrf = (await res.clone().json()).csrf;
  return res;
}

export async function apiPost(path: string, body?: unknown): Promise<Response> {
  const send = async () =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' },
      body: JSON.stringify(body ?? {}),
    });

  if (!csrf) await fetchSession();
  let res = await send();
  // A login in another tab replaces the session, which makes our cached token stale.
  if (res.status === 403 && (await res.clone().json()).error?.code === 'csrf') {
    await fetchSession();
    res = await send();
  }
  await announceIfEnded(res);
  return res;
}
