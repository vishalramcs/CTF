import type { BoardRow, FeedItem, LiveState } from '@/lib/realtime/public-state';

// Presentation only. Ranks and totals always come from the server (docs/08 §4, app.v_public_scoreboard);
// this compares two server responses and never orders teams or awards points itself.

export type MovementKind =
  'new_leader' | 'defended' | 'top_three' | 'climbed' | 'moved_up' | 'lost' | 'points';

export type Movement = {
  teamName: string;
  previousRank: number;
  rank: number;
  // Positive is up the board.
  positions: number;
  points: number;
  kind: MovementKind;
  message: string;
};

export type RankEvent = Movement & {
  id: string;
  at: string;
  challengeNumber: number | null;
  challengeTitle: string | null;
};

const plural = (n: number) => `${n} POSITION${n === 1 ? '' : 'S'}`;
const round = (n: number) => Math.round(n * 100) / 100;

function classify(
  old: BoardRow,
  row: BoardRow,
  soleLeaderBefore: boolean,
  soleLeaderNow: boolean,
): Pick<Movement, 'kind' | 'message'> {
  const positions = old.rank - row.rank;
  const points = round(row.total - old.total);
  if (row.rank === 1 && soleLeaderNow && (old.rank !== 1 || !soleLeaderBefore)) {
    return { kind: 'new_leader', message: 'NEW LEADER!' };
  }
  if (old.rank === 1 && row.rank === 1 && soleLeaderBefore && points > 0) {
    return { kind: 'defended', message: 'DEFENDED FIRST PLACE!' };
  }
  if (positions > 0) {
    if (row.rank <= 3 && old.rank > 3) return { kind: 'top_three', message: 'ENTERED THE TOP 3!' };
    return positions === 1
      ? { kind: 'moved_up', message: 'MOVED UP 1 POSITION!' }
      : { kind: 'climbed', message: `CLIMBED ${plural(positions)}!` };
  }
  if (positions < 0) return { kind: 'lost', message: `LOST ${plural(-positions)}!` };
  return { kind: 'points', message: `${points > 0 ? '+' : ''}${points} POINTS` };
}

export function diffBoards(prev: BoardRow[], next: BoardRow[]): Movement[] {
  const before = new Map(prev.map((row) => [row.teamName, row]));
  const soleLeaderBefore = prev.filter((row) => row.rank === 1).length === 1;
  const soleLeaderNow = next.filter((row) => row.rank === 1).length === 1;
  const moves: Movement[] = [];
  for (const row of next) {
    const old = before.get(row.teamName);
    if (!old) continue;
    const positions = old.rank - row.rank;
    const points = round(row.total - old.total);
    if (positions === 0 && points === 0) continue;
    moves.push({
      teamName: row.teamName,
      previousRank: old.rank,
      rank: row.rank,
      positions,
      points,
      ...classify(old, row, soleLeaderBefore, soleLeaderNow),
    });
  }
  return moves;
}

// A freeze swaps in a snapshot and a reset zeroes everyone: neither is a team moving. An older
// version is a stale response.
export function comparable(prev: LiveState, next: LiveState): boolean {
  if (next.v < prev.v || prev.frozen || next.frozen) return false;
  const reset =
    next.leaderboard.every((row) => row.total === 0) &&
    prev.leaderboard.some((row) => row.total !== 0);
  return !reset;
}

const feedKey = (item: FeedItem) =>
  `${item.at}-${item.kind}-${item.teamName}-${item.challengeNumber}`;

// Being pushed down one place is the other side of someone's climb: too noisy to announce.
export const isAnnounced = (move: Movement) =>
  move.kind !== 'points' && !(move.kind === 'lost' && move.positions > -2);

export function toRankEvents(prev: LiveState, next: LiveState, moves: Movement[]): RankEvent[] {
  const seen = new Set(prev.feed.map(feedKey));
  // The feed is newest first, so find() gives the solve that caused the move.
  const fresh = next.feed.filter((item) => item.kind === 'solve' && !seen.has(feedKey(item)));
  return moves.filter(isAnnounced).map((move) => {
    const solve = fresh.find((item) => item.teamName === move.teamName);
    return {
      ...move,
      id: `${next.v}:${move.teamName}:${move.kind}`,
      at: solve?.at ?? new Date(next.serverTime).toISOString(),
      challengeNumber: solve?.challengeNumber ?? null,
      challengeTitle: solve?.challengeTitle ?? null,
    };
  });
}
