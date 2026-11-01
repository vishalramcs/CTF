// A question that hides its coordinate in the flag: a correct flag opens a box, and only a correct
// entry reveals the fragment and puts it on that team's board.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as enter } from '@/app/api/challenges/[number]/coordinate/route';
import { GET as getChallenge } from '@/app/api/challenges/[number]/route';
import { POST as submit } from '@/app/api/challenges/[number]/submit/route';
import { fragmentAnswer, normalizeEntry } from '@/lib/coordinates/claim';
import { getCoordinateBoard } from '@/lib/coordinates/state';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { normalizeFlag } from '@/lib/flags/normalize';
import { regenerateVariants } from '@/lib/variants/regenerate';
import {
  createChallenge,
  createTeam,
  openSql,
  params,
  request,
  sessionFor,
  setStatus,
  type Auth,
} from './challenge-helpers';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const FLAG = `${env.FLAG_PREFIX}{N51.E5E0D7S2}`;
const VALUE = '51.5072° N';

let sql: postgres.Sql;
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  teamA = await createTeam(sql, 'teama');
  teamB = await createTeam(sql, 'teamb');
  authA = await sessionFor(sql, 'teama');
  authB = await sessionFor(sql, 'teamb');
  await createChallenge(sql, 5, {
    questionTemplate: '<p>Question</p>',
    fragment: { value: VALUE, order: 3, clue: 'A clue' },
  });
  await sql`UPDATE app.challenges
    SET flag_mode = 'static', flag_template = NULL, fragment_needs_entry = true,
        static_flag_hash = ${hmacHex(env.FLAG_HMAC_KEY, normalizeFlag(FLAG, env.FLAG_PREFIX)!)}
    WHERE number = 5`;
  await regenerateVariants(db, {});
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

const sendFlag = async (auth = authA, flag = FLAG) =>
  (
    await submit(
      request('/api/challenges/5/submit', { method: 'POST', auth, body: { flag } }),
      params({ number: '5' }),
    )
  ).json();
const sendEntry = async (value: string, auth = authA) =>
  (
    await enter(
      request('/api/challenges/5/coordinate', { method: 'POST', auth, body: { value } }),
      params({ number: '5' }),
    )
  ).json();
const view = async (auth = authA) =>
  (await getChallenge(request('/api/challenges/5', { auth }), params({ number: '5' }))).json();

describe('normalizing', () => {
  it.each(['N*51.5072', 'n*51.5072', '[N*51.5072]', ' [n* 51.5072] ', 'N 51.5072', 'n51.5072'])(
    'accepts %j',
    (input) => expect(normalizeEntry(input)).toBe('N 51.5072'),
  );
  it.each(['51.5072', 'N*51.507', 'N*51.50721', 'X*51.5072', 'N*51,5072', '', 'N*'])(
    'rejects %j',
    (input) => expect(normalizeEntry(input)).toBeNull(),
  );
  it('reads the answer out of a stored fragment', () => {
    expect(fragmentAnswer('51.5072° N')).toBe('N 51.5072');
    expect(fragmentAnswer(', 0.1276° W')).toBe('W 0.1276');
    expect(fragmentAnswer('not a coordinate')).toBeNull();
  });
});

describe('the flag', () => {
  it('awards points but withholds the coordinate everywhere', async () => {
    const result = await sendFlag();
    expect(result).toMatchObject({ result: 'correct', needsFragmentEntry: true });
    expect(result.points).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('51.5072');

    const page = await view();
    expect(page.solved).toMatchObject({
      fragment: null,
      orderClue: null,
      needsFragmentEntry: true,
    });
    expect((await getCoordinateBoard(teamA)).fragments).toEqual([]);
  });

  it('a wrong flag opens nothing', async () => {
    expect(await sendFlag(authA, `${env.FLAG_PREFIX}{nope}`)).toMatchObject({ result: 'wrong' });
    expect((await view()).solved).toBeNull();
  });
});

describe('the box', () => {
  it('stays shut until the flag is solved, even with the right coordinate', async () => {
    expect(await sendEntry('N*51.5072')).toEqual({ result: 'not_solved' });
    expect((await getCoordinateBoard(teamA)).fragments).toEqual([]);
    expect(await sql`SELECT 1 FROM app.fragment_claims`).toHaveLength(0);
  });

  it('a correct entry reveals the coordinate and updates the board', async () => {
    await sendFlag();
    const before = await sql`SELECT scoreboard_version AS v FROM app.event_state`;
    expect(await sendEntry('N*51.5072')).toEqual({
      result: 'correct',
      fragment: VALUE,
      orderClue: 'A clue',
    });
    const board = await getCoordinateBoard(teamA);
    expect(board.fragments.map((f) => f.value)).toEqual([VALUE]);
    expect((await view()).solved).toMatchObject({
      fragment: VALUE,
      orderClue: 'A clue',
      needsFragmentEntry: false,
    });
    const after = await sql`SELECT scoreboard_version AS v FROM app.event_state`;
    expect(Number(after[0].v)).toBe(Number(before[0].v) + 1);
  });

  it('the wrong hemisphere is wrong', async () => {
    await sendFlag();
    expect(await sendEntry('S*51.5072')).toEqual({ result: 'wrong', attemptsLeft: 7 });
    expect((await getCoordinateBoard(teamA)).fragments).toEqual([]);
  });

  it('a wrong entry reveals nothing and writes an attempt row', async () => {
    await sendFlag();
    const result = await sendEntry('N*51.5073');
    expect(result).toEqual({ result: 'wrong', attemptsLeft: 7 });
    expect(JSON.stringify(result)).not.toContain('51.5072');
    const rows = await sql`SELECT is_correct FROM app.fragment_claim_attempts`;
    expect(rows.map((r) => r.is_correct)).toEqual([false]);
  });

  it('limits the 9th wrong entry in 60 s, even for the right answer', async () => {
    await sendFlag();
    for (const left of [7, 6, 5, 4, 3, 2, 1, 0]) {
      expect(await sendEntry('N*00.0000')).toEqual({ result: 'wrong', attemptsLeft: left });
    }
    const limited = await sendEntry('N*51.5072');
    expect(limited.result).toBe('rate_limited');
    expect(limited.retryAfter).toBeGreaterThanOrEqual(1);
    expect(await sql`SELECT 1 FROM app.fragment_claim_attempts`).toHaveLength(8);
  });

  it('claiming twice changes nothing', async () => {
    await sendFlag();
    await sendEntry('N*51.5072');
    expect(await sendEntry('N*51.5072')).toEqual({ result: 'already_claimed' });
    expect(await sql`SELECT 1 FROM app.fragment_claims`).toHaveLength(1);
  });

  it('one team claiming does nothing for another', async () => {
    await sendFlag();
    await sendEntry('N*51.5072');
    expect((await getCoordinateBoard(teamB)).fragments).toEqual([]);
    expect(await sendEntry('N*51.5072', authB)).toEqual({ result: 'not_solved' });

    await sendFlag(authB);
    expect((await view(authB)).solved).toMatchObject({ fragment: null, needsFragmentEntry: true });
  });

  it('is closed when submissions are closed', async () => {
    await sendFlag();
    await sql`UPDATE app.event_state SET submissions_open = false`;
    expect(await sendEntry('N*51.5072')).toEqual({ result: 'closed' });
  });

  it('awards no extra points', async () => {
    await sendFlag();
    const total = async () => {
      const [row] = await sql`SELECT COALESCE(SUM(points), 0)::text AS t
        FROM app.score_transactions WHERE team_id = ${teamA}`;
      return row.t;
    };
    const before = await total();
    await sendEntry('N*51.5072');
    expect(await total()).toBe(before);
  });
});

describe('other questions', () => {
  it('a question without the setting still shows its fragment straight away', async () => {
    await sql`UPDATE app.challenges SET fragment_needs_entry = false WHERE number = 5`;
    expect(await sendFlag()).toMatchObject({ result: 'correct', fragment: VALUE });
    expect((await getCoordinateBoard(teamA)).fragments.map((f) => f.value)).toEqual([VALUE]);
    expect(await sendEntry('N*51.5072')).toEqual({ result: 'not_solved' });
  });
});
