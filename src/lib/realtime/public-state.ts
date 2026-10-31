import { asc, desc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { eventState, scoreboardSnapshots, vPublicFeed, vPublicScoreboard } from '@/lib/db/schema';
import { env } from '@/lib/env';
import type { EventStatus } from '@/lib/scoring/points';

// Public by design: no team id, no username. Rows come from views that never had them.
export type BoardRow = {
  rank: number;
  teamName: string;
  challengePoints: number;
  locationPoints: number;
  surprisePoints: number;
  adjustmentPoints: number;
  total: number;
  solves: number;
  locations: number;
  keys: number;
  surprises: number;
};

export type FeedItem = {
  solvedAt: string;
  teamName: string;
  challengeNumber: number;
  challengeTitle: string;
  points: number;
};

export type PublicState = {
  v: number;
  status: EventStatus;
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
  return rows.map((r) => ({
    rank: r.rank,
    teamName: r.teamName,
    challengePoints: Number(r.challengePoints),
    locationPoints: Number(r.locationPoints),
    surprisePoints: Number(r.surprisePoints),
    adjustmentPoints: Number(r.adjustmentPoints),
    total: Number(r.total),
    solves: r.solves,
    locations: r.locations,
    keys: r.keys,
    surprises: r.surprises,
  }));
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

// Queries run one after another: the app has a single pooled connection.
export async function getPublicState(): Promise<PublicState> {
  const [state] = await db
    .select({
      status: eventState.status,
      frozen: eventState.leaderboardFrozen,
      v: eventState.scoreboardVersion,
    })
    .from(eventState);
  // shortcut: a freeze with no snapshot falls back to the live board; the admin freeze writes one.
  const leaderboard = (state.frozen && (await frozenBoard())) || (await liveBoard());
  return {
    v: state.v,
    status: state.status as EventStatus,
    frozen: state.frozen,
    leaderboard,
    serverTime: Date.now(),
    channel: `${env.REALTIME_CHANNEL_PREFIX}:public`,
  };
}

export async function getPublicFeed(): Promise<FeedItem[]> {
  const [state] = await db.select({ frozen: eventState.leaderboardFrozen }).from(eventState);
  if (state.frozen) return [];
  const rows = await db.select().from(vPublicFeed).orderBy(desc(vPublicFeed.solvedAt)).limit(20);
  return rows.map((r) => ({
    solvedAt: r.solvedAt.toISOString(),
    teamName: r.teamName,
    challengeNumber: r.challengeNumber,
    challengeTitle: r.challengeTitle,
    points: Number(r.pointsAwarded),
  }));
}
