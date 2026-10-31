// R3 acceptance: the flag submit recipe (TRD §8.4, 05 §5) and docs/07 §3 scoring, through the real
// route handler.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as submit } from '@/app/api/challenges/[number]/submit/route';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { regenerateVariants } from '@/lib/variants/regenerate';
import {
  createChallenge,
  createTeam,
  flagOf,
  openSql,
  params,
  request,
  sessionFor,
  setStatus,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

let sql: postgres.Sql;
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;
let easy: TestChallenge;
let main: TestChallenge;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  teamA = await createTeam(sql, 'teama');
  teamB = await createTeam(sql, 'teamb');
  authA = await sessionFor(sql, 'teama');
  authB = await sessionFor(sql, 'teamb');
  easy = await createChallenge(sql, 1, { fragment: { value: '47', order: 3, clue: 'Clue three' } });
  main = await createChallenge(sql, 10, { fragment: { value: '11', order: 1, clue: 'Clue one' } });
  await regenerateVariants(db, {});
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

async function send(challenge: TestChallenge, flag: string, auth = authA) {
  const res = await submit(
    request(`/api/challenges/${challenge.number}/submit`, {
      method: 'POST',
      auth,
      body: { flag },
    }),
    params({ number: String(challenge.number) }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

const solves = () => sql`
  SELECT team_id, challenge_id, solve_position, points_awarded::text AS points_awarded
    FROM app.solves ORDER BY solve_position`;
const attempts = () => sql`
  SELECT result, is_correct, submitted_hash, submitted_preview FROM app.submissions ORDER BY id`;
const ledger = () => sql`
  SELECT team_id, category, points::text AS points FROM app.score_transactions ORDER BY id`;

describe('correct flag', () => {
  it('gives one solve at full points, a ledger row, and the fragment with its clue', async () => {
    expect(await send(easy, flagOf(teamA, easy))).toEqual({
      result: 'correct',
      points: 60,
      position: 1,
      fragment: '47',
      orderClue: 'Clue three',
    });
    expect(await solves()).toEqual([
      { team_id: teamA, challenge_id: easy.id, solve_position: 1, points_awarded: '60.0' },
    ]);
    expect(await ledger()).toEqual([{ team_id: teamA, category: 'challenge', points: '60.0' }]);
    const [attempt] = await attempts();
    expect(attempt).toMatchObject({ result: 'correct', is_correct: true, submitted_preview: null });
    expect(attempt.submitted_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pays each later team half a point less', async () => {
    expect(await send(easy, flagOf(teamA, easy))).toMatchObject({ points: 60, position: 1 });
    expect(await send(easy, flagOf(teamB, easy), authB)).toMatchObject({
      points: 59.5,
      position: 2,
    });
    expect(await send(main, flagOf(teamB, main), authB)).toMatchObject({
      points: 400,
      position: 1,
    });
    expect(await send(main, flagOf(teamA, main))).toMatchObject({ points: 399.5, position: 2 });
  });

  it('does not change what a wrong flag costs: nothing', async () => {
    await send(easy, 'SPIDEY{nope}');
    expect(await send(easy, flagOf(teamA, easy))).toMatchObject({ points: 60 });
  });

  it('accepts any case and surrounding whitespace', async () => {
    const result = await send(easy, `  ${flagOf(teamA, easy).toUpperCase()}\n`);
    expect(result.result).toBe('correct');
  });

  it('answers already_solved afterwards, with no second solve, ledger or attempt row', async () => {
    const flag = flagOf(teamA, easy);
    await send(easy, flag);
    expect(await send(easy, flag)).toEqual({ result: 'already_solved' });
    expect(await solves()).toHaveLength(1);
    expect(await ledger()).toHaveLength(1);
    expect(await attempts()).toHaveLength(1);
  });

  it('refuses a submit that was waiting on a pause, once the pause commits', async () => {
    // The admin's status change holds the event_state row, so the submit must wait and then see it.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const hasLock = new Promise<void>((resolve) => (locked = resolve));
    const change = sql.begin(async (tx) => {
      await tx`UPDATE app.event_state SET status = 'paused'`;
      locked();
      await held;
    });
    await hasLock;

    const pending = send(easy, flagOf(teamA, easy));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await solves()).toHaveLength(0);
    release();
    await change;

    expect(await pending).toEqual({ result: 'closed' });
    expect(await solves()).toHaveLength(0);
  });
});

describe('wrong flag', () => {
  it("rejects another team's flag and stores only its hash and a short preview", async () => {
    const stolen = flagOf(teamB, easy);
    expect(await send(easy, stolen)).toEqual({ result: 'wrong', attemptsLeft: 4 });
    expect(await solves()).toHaveLength(0);
    const [attempt] = await attempts();
    expect(attempt).toMatchObject({ result: 'wrong', is_correct: false });
    expect(attempt.submitted_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(attempt.submitted_preview).toBe(stolen.slice(0, 12));
  });

  it.each(['no braces', 'OTHER{abc}', 'SPIDEY{abc', ''])(
    'logs %j as malformed with no hash',
    async (flag) => {
      expect(await send(easy, flag)).toEqual({ result: 'wrong', attemptsLeft: 4 });
      expect((await attempts())[0]).toMatchObject({ result: 'malformed', submitted_hash: '' });
    },
  );

  it('survives a NUL byte, which Postgres text cannot hold', async () => {
    expect(await send(easy, 'SPIDEY{a\0b}')).toMatchObject({ result: 'wrong' });
    expect((await attempts())[0].submitted_preview).toBe('SPIDEY{ab}');
  });
});

describe('rate limit', () => {
  it('limits the 6th wrong attempt in 60 s, even for the right flag, per challenge', async () => {
    for (const left of [4, 3, 2, 1, 0]) {
      expect(await send(easy, 'SPIDEY{nope}')).toEqual({ result: 'wrong', attemptsLeft: left });
    }
    const limited = await send(easy, 'SPIDEY{nope}');
    expect(limited.result).toBe('rate_limited');
    expect(limited.retryAfter).toBeGreaterThanOrEqual(1);
    expect(limited.retryAfter).toBeLessThanOrEqual(60);
    expect((await send(easy, flagOf(teamA, easy))).result).toBe('rate_limited');
    // A blocked attempt writes no row, so hammering can't extend the lockout.
    expect(await attempts()).toHaveLength(5);
    expect(await solves()).toHaveLength(0);

    // Another challenge and another team keep their own counters.
    expect((await send(main, 'SPIDEY{nope}')).result).toBe('wrong');
    expect((await send(easy, 'SPIDEY{nope}', authB)).result).toBe('wrong');
  });

  it('frees up once the attempts leave the 60 s window', async () => {
    for (let i = 0; i < 5; i++) await send(easy, 'SPIDEY{nope}');
    await sql`UPDATE app.submissions SET submitted_at = now() - interval '61 seconds'`;
    expect(await send(easy, flagOf(teamA, easy))).toMatchObject({ result: 'correct' });
  });
});

describe('event status', () => {
  it.each(['not_started', 'paused', 'ended'] as const)(
    'closes everything while %s',
    async (status) => {
      await setStatus(sql, status);
      for (const challenge of [easy, main]) {
        expect(await send(challenge, flagOf(teamA, challenge))).toEqual({ result: 'closed' });
      }
      expect(await solves()).toHaveLength(0);
      expect(await attempts()).toHaveLength(0);
    },
  );

  it('closes everything when submissions are switched off', async () => {
    await sql`UPDATE app.event_state SET submissions_open = false`;
    expect(await send(easy, flagOf(teamA, easy))).toEqual({ result: 'closed' });
  });
});

describe('races across separate server instances', () => {
  // Each fresh module graph gets its own connection, like separate serverless instances.
  async function instances(count: number) {
    return Promise.all(
      Array.from({ length: count }, async () => {
        vi.resetModules();
        return {
          route: await import('@/app/api/challenges/[number]/submit/route'),
          client: await import('@/lib/db/client'),
        };
      }),
    );
  }

  async function sendAll(attemptsList: { auth: Auth; flag: string }[]) {
    const list = await instances(attemptsList.length);
    try {
      const responses = await Promise.all(
        list.map(({ route }, i) =>
          route.POST(
            request(`/api/challenges/${easy.number}/submit`, {
              method: 'POST',
              auth: attemptsList[i].auth,
              body: { flag: attemptsList[i].flag },
            }),
            params({ number: String(easy.number) }),
          ),
        ),
      );
      return Promise.all(responses.map((res) => res.json()));
    } finally {
      await Promise.all(list.map(({ client }) => client.db.$client.end()));
    }
  }

  it(
    '20 parallel correct submits by one team give exactly 1 solve',
    { timeout: 240_000 },
    async () => {
      const flag = flagOf(teamA, easy);
      const results = await sendAll(Array.from({ length: 20 }, () => ({ auth: authA, flag })));
      const counts = Object.groupBy(results, (r) => r.result);
      expect(counts.correct).toHaveLength(1);
      expect(counts.already_solved).toHaveLength(19);
      expect(await solves()).toHaveLength(1);
      expect(await ledger()).toHaveLength(1);
      expect(await attempts()).toHaveLength(1);
    },
  );

  it(
    'two teams solving at the same moment get positions 1 and 2 and 60 and 59.5',
    { timeout: 240_000 },
    async () => {
      const results = await sendAll([
        { auth: authA, flag: flagOf(teamA, easy) },
        { auth: authB, flag: flagOf(teamB, easy) },
      ]);
      expect(results.map((r) => r.result)).toEqual(['correct', 'correct']);
      expect(results.map((r) => r.position).sort()).toEqual([1, 2]);
      expect(results.map((r) => r.points).sort((a, b) => b - a)).toEqual([60, 59.5]);
      expect((await ledger()).map((l) => l.points).sort()).toEqual(['59.5', '60.0']);
    },
  );

  it(
    '8 parallel wrong submits slip no 6th attempt past the limit',
    { timeout: 240_000 },
    async () => {
      const results = await sendAll(
        Array.from({ length: 8 }, () => ({ auth: authA, flag: 'SPIDEY{nope}' })),
      );
      const counts = Object.groupBy(results, (r) => r.result);
      expect(counts.wrong).toHaveLength(5);
      expect(counts.rate_limited).toHaveLength(3);
      expect(await attempts()).toHaveLength(5);
    },
  );
});
