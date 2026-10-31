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

// The frozen board is this snapshot, taken in the same transaction as the flag. Keys match
// BoardRow, because /api/public/state serves it as is.
export function snapshotBoard(tx: Tx, createdBy: string | null) {
  return tx.execute(sql`INSERT INTO app.scoreboard_snapshots (snapshot, created_by)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'rank', s.rank, 'teamName', s.team_name, 'total', s.total,
             'easySolved', s.easy_solved, 'mediumSolved', s.medium_solved,
             'difficultSolved', s.difficult_solved, 'mainDone', s.main_done,
             'coordinatesDone', s.coordinates_done
           ) ORDER BY s.rank, s.team_name), '[]'::jsonb), ${createdBy}::uuid
    FROM app.v_public_scoreboard s`);
}

export async function loadEventState() {
  const [state] = await db
    .select({
      status: eventState.status,
      statusChangedAt: eventState.statusChangedAt,
      submissionsOpen: eventState.submissionsOpen,
      leaderboardFrozen: eventState.leaderboardFrozen,
      freezeAt: eventState.freezeAt,
    })
    .from(eventState)
    .where(eq(eventState.id, 1));
  return state;
}
