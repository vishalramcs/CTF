import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import type { EventStatus } from '@/lib/scoring/points';

// TRD §6: public pings only. A payload is never built from request or team data, so none can leak.
export const channelName = () => `${env.REALTIME_CHANNEL_PREFIX}:public`;

export const boardPayload = (): Record<string, never> => ({});
export const statusPayload = (status: EventStatus): { status: EventStatus } => ({ status });

const TIMEOUT_MS = 1500;

// Never throws: a slow or broken Realtime must not fail a submit. The log has no secrets.
export async function sendBroadcast(
  event: 'board' | 'status',
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic: channelName(), event, payload, private: false }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    console.error('broadcast failed', { event, message: e instanceof Error ? e.message : 'error' });
    return false;
  }
}

// Call after the transaction has committed: this uses `db`, not `tx`.
// The gate lets about one ping per second through; clients refetch again 1.5 s later.
export async function notifyBoard(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const [row] = await db.execute<{ open: boolean }>(
      sql`SELECT app.try_open_gate('board') AS open`,
    );
    if (row?.open) await sendBroadcast('board', boardPayload());
  } catch (e) {
    console.error('broadcast failed', {
      event: 'board',
      message: e instanceof Error ? e.message : 'error',
    });
  }
}

export async function notifyStatus(status: EventStatus): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  await sendBroadcast('status', statusPayload(status));
}
