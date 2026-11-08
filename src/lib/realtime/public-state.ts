import { asc, desc, eq, sql } from 'drizzle-orm';

import { bumpBoard, snapshotBoard } from '@/lib/admin/event';

import { db } from '@/lib/db/client';
import { eventState, scoreboardSnapshots, vPublicFeed, vPublicScoreboard } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { notifyBoard } from '@/lib/realtime/broadcast';
import type { EventStatus } from '@/lib/scoring/points';

// Public by design: no team id, no username, no times, no coordinate values. Rows come from views
// that never had them. `mainDone` and `coordinatesDone` are statuses only.
export type BoardRow = {
  rank: number;
  teamName: string;
  total: number;
  easySolved: number;
  mediumSolved: number;
  difficultSolved: number;
  mainDone: boolean;
  coordinatesDone: boolean;
};

export type FeedItem = {
  at: string;
  kind: 'solve' | 'main_first' | 'coordinate_winner';
  teamName: string;
  challengeNumber: number | null;
  challengeTitle: string | null;
  points: number | null;
};

export type PublicState = {
  v: number;
  status: EventStatus;
  /** When the status last changed (ISO): one END is told apart from a rehearsal's. */
  statusChangedAt: string;
  frozen: boolean;
  leaderboard: BoardRow[];
  serverTime: number;
  // The public channel name. Not a secret, and the browser can't read server env.
  channel: string;
};

export type LiveState = PublicState & { feed: FeedItem[] };

async function liveBoard(): Promise<BoardRow[]> {
  const rows = await db
    .select()
    .from(vPublicScoreboard)
    .orderBy(asc(vPublicScoreboard.rank), asc(vPublicScoreboard.teamName));
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

// A snapshot is the board as served: an array of BoardRow, or { leaderboard: BoardRow[] }.
async function frozenBoard(): Promise<BoardRow[] | null> {
  const [snap] = await db
    .select({ snapshot: scoreboardSnapshots.snapshot })
    .from(scoreboardSnapshots)
    .orderBy(desc(scoreboardSnapshots.createdAt))
    .limit(1);
  const body = snap?.snapshot as BoardRow[] | { leaderboard?: BoardRow[] } | undefined;
  const rows = Array.isArray(body) ? body : body?.leaderboard;
  return Array.isArray(rows) ? rows : null;
}

// docs/08 §6. No cron exists, so the first public read after freeze_at freezes the board, once,
// under the event_state row lock (the same lock an admin freeze takes).
async function freezeIfDue(): Promise<boolean> {
  const froze = await db.transaction(async (tx) => {
    const [row] = await tx.execute<{ due: boolean }>(sql`SELECT
        (freeze_at IS NOT NULL AND freeze_at <= now() AND NOT leaderboard_frozen) AS due
      FROM app.event_state WHERE id = 1 FOR UPDATE`);
    if (!row.due) return false;
    await snapshotBoard(tx, null);
    await tx.update(eventState).set({ leaderboardFrozen: true }).where(eq(eventState.id, 1));
    await bumpBoard(tx);
    return true;
  });
  if (froze) await notifyBoard(); // after the commit
  return froze;
}

// Queries run one after another: the app has a single pooled connection.
export async function getPublicState(): Promise<PublicState> {
  const read = () =>
    db
      .select({
        status: eventState.status,
        statusChangedAt: eventState.statusChangedAt,
        frozen: eventState.leaderboardFrozen,
        v: eventState.scoreboardVersion,
        due: sql<boolean>`(${eventState.freezeAt} IS NOT NULL AND ${eventState.freezeAt} <= now()
          AND NOT ${eventState.leaderboardFrozen})`,
      })
      .from(eventState);
  let [state] = await read();
  if (state.due && (await freezeIfDue())) [state] = await read();
  // shortcut: a freeze with no snapshot falls back to the live board; every freeze writes one.
  const leaderboard = (state.frozen && (await frozenBoard())) || (await liveBoard());
  return {
    v: state.v,
    status: state.status as EventStatus,
    statusChangedAt: new Date(state.statusChangedAt).toISOString(),
    frozen: state.frozen,
    leaderboard,
    serverTime: Date.now(),
    channel: `${env.REALTIME_CHANNEL_PREFIX}:public`,
  };
}

export async function getPublicFeed(): Promise<FeedItem[]> {
  const [state] = await db.select({ frozen: eventState.leaderboardFrozen }).from(eventState);
  if (state.frozen) return [];
  const rows = await db.select().from(vPublicFeed).orderBy(desc(vPublicFeed.occurredAt)).limit(20);
  return rows.map((r) => ({
    at: r.occurredAt.toISOString(),
    kind: r.kind as FeedItem['kind'],
    teamName: r.teamName,
    challengeNumber: r.challengeNumber,
    challengeTitle: r.challengeTitle,
    points: r.pointsAwarded === null ? null : Number(r.pointsAwarded),
  }));
}
