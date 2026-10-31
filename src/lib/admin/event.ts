import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 05 §5: every event_state change waits for in-flight submits, which hold FOR SHARE.
export async function lockEvent(tx: Tx) {
  const [state] = await tx.select().from(eventState).where(eq(eventState.id, 1)).for('update');
  return state;
}

// Each change that moves the public board bumps the version, so pollers know to refetch.
export function bumpBoard(tx: Tx) {
  return tx
    .update(eventState)
    .set({ scoreboardVersion: sql`${eventState.scoreboardVersion} + 1`, updatedAt: sql`now()` })
    .where(eq(eventState.id, 1));
}

export async function loadEventState() {
  const [state] = await db
    .select({
      status: eventState.status,
      statusChangedAt: eventState.statusChangedAt,
      submissionsOpen: eventState.submissionsOpen,
      leaderboardFrozen: eventState.leaderboardFrozen,
    })
    .from(eventState)
    .where(eq(eventState.id, 1));
  return state;
}
