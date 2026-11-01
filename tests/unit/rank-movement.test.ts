import { describe, expect, it } from 'vitest';

import { comparable, diffBoards, isAnnounced, toRankEvents } from '@/lib/leaderboard/movement';
import type { BoardRow, FeedItem, LiveState } from '@/lib/realtime/public-state';

const team = (teamName: string, rank: number, total: number): BoardRow => ({
  rank,
  teamName,
  total,
  easySolved: 0,
  mediumSolved: 0,
  difficultSolved: 0,
  mainDone: false,
  coordinatesDone: false,
});

const start = [
  team('Alpha', 1, 900),
  team('Bravo', 2, 800),
  team('Charlie', 3, 600),
  team('Delta', 4, 400),
];

const state = (over: Partial<LiveState>): LiveState => ({
  v: 1,
  status: 'running',
  frozen: false,
  leaderboard: start,
  serverTime: Date.UTC(2026, 10, 1, 8),
  channel: 'test:public',
  feed: [],
  ...over,
});

const move = (moves: ReturnType<typeof diffBoards>, name: string) =>
  moves.find((m) => m.teamName === name);

describe('diffBoards', () => {
  it('reports points with no change of position', () => {
    const next = [team('Alpha', 1, 900), team('Bravo', 2, 850), start[2], start[3]];
    expect(diffBoards(start, next)).toEqual([
      expect.objectContaining({ teamName: 'Bravo', positions: 0, points: 50, kind: 'points' }),
    ]);
  });

  it('reports a climb of one position, and the team it passed', () => {
    const next = [start[0], team('Charlie', 2, 850), team('Bravo', 3, 800), start[3]];
    const moves = diffBoards(start, next);
    expect(move(moves, 'Charlie')).toMatchObject({
      previousRank: 3,
      rank: 2,
      positions: 1,
      points: 250,
      kind: 'moved_up',
      message: 'MOVED UP 1 POSITION!',
    });
    expect(move(moves, 'Bravo')).toMatchObject({ positions: -1, kind: 'lost' });
    expect(moves).toHaveLength(2);
  });

  it('reports a climb of several positions below the podium', () => {
    const board = [...start, team('Echo', 5, 300), team('Foxtrot', 6, 200)];
    const next = [
      start[0],
      start[1],
      start[2],
      team('Foxtrot', 4, 500),
      team('Delta', 5, 400),
      team('Echo', 6, 300),
    ];
    expect(move(diffBoards(board, next), 'Foxtrot')).toMatchObject({
      positions: 2,
      kind: 'climbed',
      message: 'CLIMBED 2 POSITIONS!',
    });
  });

  it('reports a team entering the top three', () => {
    const next = [start[0], start[1], team('Delta', 3, 700), team('Charlie', 4, 600)];
    expect(move(diffBoards(start, next), 'Delta')).toMatchObject({
      positions: 1,
      kind: 'top_three',
      message: 'ENTERED THE TOP 3!',
    });
  });

  it('reports a new leader, and the old leader losing first place', () => {
    // The brief's example: Delta reaches 900 and wins the tie-break on the server.
    const next = [
      team('Delta', 1, 900),
      team('Alpha', 2, 900),
      team('Bravo', 3, 800),
      team('Charlie', 4, 600),
    ];
    const moves = diffBoards(start, next);
    expect(move(moves, 'Delta')).toMatchObject({
      previousRank: 4,
      rank: 1,
      positions: 3,
      points: 500,
      kind: 'new_leader',
      message: 'NEW LEADER!',
    });
    expect(move(moves, 'Alpha')).toMatchObject({ positions: -1, points: 0, kind: 'lost' });
  });

  it('reports a leader who scores and stays first as defending', () => {
    const next = [team('Alpha', 1, 1000), start[1], start[2], start[3]];
    expect(move(diffBoards(start, next), 'Alpha')).toMatchObject({
      kind: 'defended',
      message: 'DEFENDED FIRST PLACE!',
    });
  });

  it('treats breaking a tie for first as a new leader, not a defence', () => {
    const tied = [team('Alpha', 1, 0), team('Bravo', 1, 0), team('Charlie', 1, 0)];
    const next = [team('Bravo', 1, 100), team('Alpha', 2, 0), team('Charlie', 2, 0)];
    expect(move(diffBoards(tied, next), 'Bravo')?.kind).toBe('new_leader');
  });

  it('uses the server rank for teams sharing one, so equal points are not a move', () => {
    const tied = [team('Alpha', 1, 500), team('Bravo', 1, 500), team('Charlie', 3, 100)];
    const next = [team('Alpha', 1, 500), team('Bravo', 1, 500), team('Charlie', 3, 150)];
    const moves = diffBoards(tied, next);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ teamName: 'Charlie', positions: 0, kind: 'points' });
  });

  it('handles several teams scoring between two responses', () => {
    const next = [
      team('Charlie', 1, 1000),
      team('Delta', 2, 950),
      team('Alpha', 3, 900),
      team('Bravo', 4, 800),
    ];
    const moves = diffBoards(start, next);
    expect(moves.map((m) => [m.teamName, m.positions])).toEqual([
      ['Charlie', 2],
      ['Delta', 2],
      ['Alpha', -2],
      ['Bravo', -2],
    ]);
    expect(moves.filter((m) => m.kind === 'new_leader')).toHaveLength(1);
  });

  it('reports a score lowered by an organiser', () => {
    const next = [start[0], team('Bravo', 3, 500), team('Charlie', 2, 600), start[3]];
    expect(move(diffBoards(start, next), 'Bravo')).toMatchObject({ points: -300, positions: -1 });
  });

  it('keeps fractions exact', () => {
    const next = [start[0], team('Bravo', 2, 800.3), start[2], start[3]];
    expect(move(diffBoards(start, next), 'Bravo')?.points).toBe(0.3);
  });

  it('ignores teams that joined or left', () => {
    const next = [start[0], start[1], start[2], team('Golf', 4, 100)];
    expect(diffBoards(start, next)).toEqual([]);
  });

  it('gives every device the same movements for the same two responses', () => {
    const next = [start[0], team('Charlie', 2, 850), team('Bravo', 3, 800), start[3]];
    expect(diffBoards(start, next)).toEqual(diffBoards(start, next));
  });
});

describe('comparable', () => {
  it('accepts a newer version', () => {
    expect(comparable(state({ v: 1 }), state({ v: 2 }))).toBe(true);
  });
  it('rejects a stale response', () => {
    expect(comparable(state({ v: 3 }), state({ v: 2 }))).toBe(false);
  });
  it('rejects going into or out of a freeze', () => {
    expect(comparable(state({}), state({ v: 2, frozen: true }))).toBe(false);
    expect(comparable(state({ frozen: true }), state({ v: 2 }))).toBe(false);
  });
  it('rejects an event reset', () => {
    const zero = start.map((row) => ({ ...row, rank: 1, total: 0 }));
    expect(comparable(state({}), state({ v: 2, leaderboard: zero }))).toBe(false);
  });
});

describe('toRankEvents', () => {
  const solve: FeedItem = {
    at: '2026-11-01T08:00:05.000Z',
    kind: 'solve',
    teamName: 'Delta',
    challengeNumber: 7,
    challengeTitle: 'Placeholder',
    points: 500,
  };
  const next = [
    team('Delta', 1, 900),
    team('Alpha', 2, 900),
    team('Bravo', 3, 800),
    team('Charlie', 4, 600),
  ];

  it('attaches the new solve and its server time', () => {
    const prev = state({});
    const after = state({ v: 2, leaderboard: next, feed: [solve] });
    const [event] = toRankEvents(prev, after, diffBoards(prev.leaderboard, next));
    expect(event).toMatchObject({
      teamName: 'Delta',
      kind: 'new_leader',
      at: solve.at,
      challengeNumber: 7,
      challengeTitle: 'Placeholder',
      id: '2:Delta:new_leader',
    });
  });

  it('does not attach a solve the last response already had', () => {
    const prev = state({ feed: [solve] });
    const after = state({ v: 2, leaderboard: next, feed: [solve] });
    const [event] = toRankEvents(prev, after, diffBoards(prev.leaderboard, next));
    expect(event.challengeNumber).toBeNull();
    expect(event.at).toBe(new Date(after.serverTime).toISOString());
  });

  it('gives the same id to the same move, so a repeat is dropped', () => {
    const prev = state({});
    const after = state({ v: 2, leaderboard: next });
    const moves = diffBoards(prev.leaderboard, next);
    expect(toRankEvents(prev, after, moves)).toEqual(toRankEvents(prev, after, moves));
  });

  it('announces real moves but not a single place lost or points alone', () => {
    const base = { teamName: 'A', previousRank: 2, rank: 3, points: 0, message: '' };
    expect(isAnnounced({ ...base, positions: -1, kind: 'lost' })).toBe(false);
    expect(isAnnounced({ ...base, positions: -2, kind: 'lost' })).toBe(true);
    expect(isAnnounced({ ...base, positions: 0, kind: 'points' })).toBe(false);
    expect(isAnnounced({ ...base, positions: 1, kind: 'moved_up' })).toBe(true);
  });
});
