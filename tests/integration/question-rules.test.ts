// R9 acceptance (docs/08-Question-Rules.md): the question groups, position scoring, fragments, the
// Main Question, the coordinate race and the ranking, through the real route handlers.
// Wipes the app tables, so re-run `pnpm seed` afterwards.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as coordinatesGet } from '@/app/api/coordinates/route';
import { POST as coordinatesSubmit } from '@/app/api/coordinates/submit/route';
import { GET as challengeGet } from '@/app/api/challenges/[number]/route';
import { POST as submit } from '@/app/api/challenges/[number]/submit/route';
import { GET as cardsGet } from '@/app/api/challenges/route';
import { GET as feedGet } from '@/app/api/public/feed/route';
import { GET as stateGet } from '@/app/api/public/state/route';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { regenerateVariants } from '@/lib/variants/regenerate';
import {
  createAdminSession,
  createChallenge,
  createTeam,
  flagOf,
  openSql,
  params,
  request,
  sessionFor,
  setFinalAnswer,
  setStatus,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

const ANSWER = 'Zyxwopolis';
const FINAL = ['FINAL-A-5501', 'FINAL-B-5502', 'FINAL-C-5503'];
// Placeholder plan: 2 Easy, 2 Medium, 2 Difficult.
const FRAGMENTS: Record<number, string> = {
  1: 'FRAG-1-7701',
  2: 'FRAG-2-7702',
  5: 'FRAG-5-7705',
  6: 'FRAG-6-7706',
  9: 'FRAG-9-7709',
  10: 'FRAG-10-7710',
};
const ORDERS: Record<number, number> = { 1: 3, 2: 1, 5: 5, 6: 2, 9: 6, 10: 4 };

let sql: postgres.Sql;
let c: Record<number, TestChallenge>;
let team: { id: string; auth: Auth }[];

beforeAll(() => {
  sql = openSql();
});

async function addTeam(name: string) {
  const id = await createTeam(sql, name);
  return { id, auth: await sessionFor(sql, name) };
}

beforeEach(async () => {
  await wipeAppTables(sql);
  c = {};
  for (let n = 1; n <= 13; n++) {
    c[n] = await createChallenge(
      sql,
      n,
      FRAGMENTS[n]
        ? { fragment: { value: FRAGMENTS[n], order: ORDERS[n], clue: `Clue ${n}` } }
        : {},
    );
  }
  for (const [i, value] of FINAL.entries()) {
    await sql`INSERT INTO app.final_coordinates (position, label, value)
      VALUES (${i + 1}, ${`L${i + 1}`}, ${value})`;
  }
  await setFinalAnswer(sql, ANSWER);
  team = [];
  for (let i = 0; i < 3; i++) team.push(await addTeam(`t${i}`));
  await regenerateVariants(db, {});
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

async function flag(n: number, who: (typeof team)[number], text = flagOf(who.id, c[n])) {
  const res = await submit(
    request(`/api/challenges/${n}/submit`, {
      method: 'POST',
      auth: who.auth,
      body: { flag: text },
    }),
    params({ number: String(n) }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

async function location(who: (typeof team)[number], answer = ANSWER) {
  const res = await coordinatesSubmit(
    request('/api/coordinates/submit', { method: 'POST', auth: who.auth, body: { answer } }),
    params({}),
  );
  expect(res.status).toBe(200);
  return res.json();
}

const board = async () => (await (await stateGet()).json()).leaderboard;
const ledgerTotal = async () =>
  (await sql`SELECT coalesce(sum(points), 0)::text AS total FROM app.score_transactions`)[0].total;

describe('question groups', () => {
  it('lists the 12 regular questions in Easy, Medium and Difficult groups of four', async () => {
    const res = await cardsGet(request('/api/challenges', { auth: team[0].auth }), params({}));
    const cards: { number: number; difficulty: string; basePoints: number }[] = (await res.json())
      .challenges;
    const group = (difficulty: string) =>
      cards.filter((card) => card.difficulty === difficulty).map((card) => card.number);
    expect(group('easy')).toEqual([1, 2, 3, 4]);
    expect(group('medium')).toEqual([5, 6, 7, 8]);
    expect(group('difficult')).toEqual([9, 10, 11, 12]);
    const bases = (difficulty: string) =>
      new Set(
        cards.filter((card) => card.difficulty === difficulty).map((card) => card.basePoints),
      );
    expect([bases('easy'), bases('medium'), bases('difficult')]).toEqual([
      new Set([50]),
      new Set([75]),
      new Set([100]),
    ]);
  });

  it('keeps the Main Question separate: one question, base 200, and only one allowed', async () => {
    const res = await cardsGet(request('/api/challenges', { auth: team[0].auth }), params({}));
    const cards: { number: number; difficulty: string; basePoints: number }[] = (await res.json())
      .challenges;
    expect(cards.filter((card) => card.difficulty === 'main_difficult')).toEqual([
      expect.objectContaining({ number: 13, basePoints: 200 }),
    ]);
    expect(cards).toHaveLength(13);
    await expect(
      sql`UPDATE app.challenges SET difficulty = 'main_difficult' WHERE number = 12`,
    ).rejects.toThrow('challenges_one_main_uq');
  });
});

describe('position scoring', () => {
  it('pays 50, 49.5, 49, 48.5, 48 to the first five, then 47.75 and 47.5, without rounding', async () => {
    const teams = [...team];
    for (let i = teams.length; i < 7; i++) teams.push(await addTeam(`more${i}`));
    await regenerateVariants(db, {});
    const paid: number[] = [];
    for (const who of teams) paid.push((await flag(1, who)).points);
    expect(paid).toEqual([50, 49.5, 49, 48.5, 48, 47.75, 47.5]);

    // Stored and summed exactly: no float drift, no rounding to one decimal.
    expect(await ledgerTotal()).toBe('340.25');
    const rows =
      await sql`SELECT points_awarded::text AS p FROM app.solves ORDER BY solve_position`;
    expect(rows.map((r) => r.p)).toEqual([
      '50.00',
      '49.50',
      '49.00',
      '48.50',
      '48.00',
      '47.75',
      '47.50',
    ]);
    const [sixth] =
      await sql`SELECT total::text AS total FROM app.v_scoreboard WHERE team_id = ${teams[5].id}`;
    expect(sixth.total).toBe('47.75');
  });

  it('pays the Main Question the same way from its own base of 200', async () => {
    expect((await flag(13, team[0])).points).toBe(200);
    expect((await flag(13, team[1])).points).toBe(199.5);
  });

  it('awards nothing for a wrong submission', async () => {
    expect(await flag(1, team[0], 'EYE{nope}')).toMatchObject({ result: 'wrong' });
    expect(await sql`SELECT 1 FROM app.solves`).toHaveLength(0);
    expect(await ledgerTotal()).toBe('0');
    expect((await board()).find((r: { teamName: string }) => r.teamName === 'Team t0').total).toBe(
      0,
    );
  });

  it('cannot award the same team twice for one question', async () => {
    expect(await flag(1, team[0])).toMatchObject({ result: 'correct', points: 50 });
    expect(await flag(1, team[0])).toEqual({ result: 'already_solved' });
    expect(await sql`SELECT 1 FROM app.solves`).toHaveLength(1);
    expect(await ledgerTotal()).toBe('50.00');
    await expect(
      sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${team[0].id}, ${c[1].id})`,
    ).rejects.toThrow('solves_team_id_challenge_id_key');
  });
});

describe('simultaneous solves across server instances', () => {
  async function instances<T>(count: number, load: () => Promise<T>) {
    return Promise.all(
      Array.from({ length: count }, async () => {
        vi.resetModules();
        return { route: await load(), client: await import('@/lib/db/client') };
      }),
    );
  }

  it(
    'gives every team a unique position and the matching points',
    { timeout: 240_000 },
    async () => {
      const teams = [...team];
      for (let i = teams.length; i < 8; i++) teams.push(await addTeam(`more${i}`));
      await regenerateVariants(db, {});
      const list = await instances(8, () => import('@/app/api/challenges/[number]/submit/route'));
      try {
        const responses = await Promise.all(
          list.map(({ route }, i) =>
            route.POST(
              request('/api/challenges/1/submit', {
                method: 'POST',
                auth: teams[i].auth,
                body: { flag: flagOf(teams[i].id, c[1]) },
              }),
              params({ number: '1' }),
            ),
          ),
        );
        const results = await Promise.all(responses.map((res) => res.json()));
        expect(results.map((r) => r.result)).toEqual(Array(8).fill('correct'));
      } finally {
        await Promise.all(list.map(({ client }) => client.db.$client.end()));
      }
      const rows = await sql`SELECT solve_position AS p, points_awarded::text AS pts
      FROM app.solves ORDER BY solve_position`;
      expect(rows.map((r) => r.p)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(rows.map((r) => r.pts)).toEqual([
        '50.00',
        '49.50',
        '49.00',
        '48.50',
        '48.00',
        '47.75',
        '47.50',
        '47.25',
      ]);
    },
  );
});

describe('fragments', () => {
  it('shows a fragment only after the question is solved, and it is identical for every team', async () => {
    const detail = async (n: number, who: (typeof team)[number]) =>
      (
        await challengeGet(
          request(`/api/challenges/${n}`, { auth: who.auth }),
          params({ number: String(n) }),
        )
      ).text();
    const coordinates = async (who: (typeof team)[number]) =>
      (await coordinatesGet(request('/api/coordinates', { auth: who.auth }), params({}))).text();

    // Nothing before solving: not in the question, the cards, the board or the public state.
    for (const who of team) {
      for (const text of [await detail(1, who), await coordinates(who)]) {
        expect(text).not.toContain(FRAGMENTS[1]);
        expect(text).not.toContain('Clue 1');
      }
    }
    const open = await (await stateGet()).text();
    expect(open).not.toContain(FRAGMENTS[1]);

    const first = await flag(1, team[0]);
    const second = await flag(1, team[1]);
    expect(first).toMatchObject({ fragment: FRAGMENTS[1], orderClue: 'Clue 1' });
    expect(second.fragment).toBe(first.fragment);
    expect(await detail(1, team[0])).toContain(FRAGMENTS[1]);
    expect(await detail(1, team[1])).toContain(FRAGMENTS[1]);
    // Team 2 still has not earned it.
    expect(await detail(1, team[2])).not.toContain(FRAGMENTS[1]);
    expect(await coordinates(team[2])).not.toContain(FRAGMENTS[1]);

    // A question without a fragment returns none, and the real order is never sent.
    expect(await flag(3, team[0])).not.toHaveProperty('fragment');
    const mine = JSON.parse(await coordinates(team[0]));
    expect(mine.fragments).toEqual([
      {
        number: 1,
        title: 'Challenge 1',
        difficulty: 'easy',
        value: FRAGMENTS[1],
        orderClue: 'Clue 1',
      },
    ]);
    expect(mine.slots).toBe(6);
    expect(JSON.stringify(mine)).not.toMatch(/coordinateOrder|coordinate_order/);

    // Stored once on the challenge, not per team.
    const rows =
      await sql`SELECT count(*)::int AS n FROM app.challenges WHERE fragment_value IS NOT NULL`;
    expect(rows[0].n).toBe(6);
    const columns = await sql`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'team_challenge_variants'`;
    expect(columns.map((x) => x.column_name)).not.toContain('fragment_value');
  });
});

describe('the Main Question', () => {
  it('reveals the three final coordinates only to teams that solved it, and keeps the six fragments', async () => {
    const coordinates = async (who: (typeof team)[number]) =>
      (await coordinatesGet(request('/api/coordinates', { auth: who.auth }), params({}))).json();

    // Wrong flag and unsolved teams get nothing.
    const wrong = await flag(13, team[1], 'EYE{nope}');
    expect(JSON.stringify(wrong)).not.toContain(FINAL[0]);
    expect((await coordinates(team[1])).finalCoordinates).toBeNull();

    const solved = await flag(13, team[0]);
    expect(solved.finalCoordinates).toEqual([
      { label: 'L1', value: FINAL[0] },
      { label: 'L2', value: FINAL[1] },
      { label: 'L3', value: FINAL[2] },
    ]);
    expect(solved).not.toHaveProperty('fragment');
    expect((await coordinates(team[0])).finalCoordinates).toHaveLength(3);
    for (const other of [team[1], team[2]]) {
      const text = JSON.stringify(await coordinates(other));
      for (const value of FINAL) expect(text).not.toContain(value);
    }
    const detail = await (
      await challengeGet(
        request('/api/challenges/13', { auth: team[1].auth }),
        params({ number: '13' }),
      )
    ).text();
    for (const value of FINAL) expect(detail).not.toContain(value);

    // Solving it does not hand over the fragments from the regular questions.
    expect((await coordinates(team[0])).fragments).toEqual([]);

    // First solver and timestamp are on record, and the public feed announces the first team only.
    const [first] = await sql`SELECT t.name, s.solved_at FROM app.solves s
      JOIN app.teams t ON t.id = s.team_id WHERE s.solve_position = 1 AND s.challenge_id = ${c[13].id}`;
    expect(first.name).toBe('Team t0');
    await flag(13, team[1]);
    const feed = (await (await feedGet()).json()).feed as { kind: string; teamName: string }[];
    expect(feed.filter((f) => f.kind === 'main_first')).toEqual([
      expect.objectContaining({ teamName: 'Team t0', challengeNumber: 13 }),
    ]);
    expect(JSON.stringify(feed)).not.toContain(FINAL[0]);
  });
});

describe('the coordinate race', () => {
  it('tracks the coordinate winner apart from the overall winner', async () => {
    // Team 0 leads overall; team 1 finds the location first; team 2 finds it afterwards.
    await flag(1, team[0]);
    await flag(5, team[0]);
    expect(await location(team[1], 'wrong place')).toMatchObject({ result: 'wrong' });
    expect(await location(team[1], '  ZYXWOPOLIS. ')).toEqual({ result: 'correct', winner: true });
    expect(await location(team[0])).toEqual({ result: 'correct', winner: false });
    expect(await location(team[2])).toEqual({ result: 'correct', winner: false });
    expect(await location(team[1])).toEqual({ result: 'already_completed' });

    const [state] =
      await sql`SELECT coordinate_winner_id AS w, coordinate_won_at AS at FROM app.event_state`;
    expect(state.w).toBe(team[1].id);
    expect(state.at).not.toBeNull();

    // Others still get their own status, but no bonus points: the ledger is only the two solves.
    expect(await ledgerTotal()).toBe('125.00');
    const rows = await board();
    expect(rows[0]).toMatchObject({
      teamName: 'Team t0',
      rank: 1,
      total: 125,
      coordinatesDone: true,
    });
    expect(rows.find((r: { teamName: string }) => r.teamName === 'Team t1')).toMatchObject({
      total: 0,
      coordinatesDone: true,
    });
    // Team 0 is the overall leader and is not the coordinate winner.
    const feed = (await (await feedGet()).json()).feed as { kind: string; teamName: string }[];
    expect(feed.filter((f) => f.kind === 'coordinate_winner')).toEqual([
      expect.objectContaining({ teamName: 'Team t1' }),
    ]);
    expect(JSON.stringify(await (await stateGet()).text())).not.toContain(ANSWER);
  });

  it('writes an attempt row for every checked submit, and rate-limits 8 wrong per 60 s', async () => {
    for (const left of [7, 6, 5, 4, 3, 2, 1, 0]) {
      expect(await location(team[0], `nope ${left}`)).toEqual({
        result: 'wrong',
        attemptsLeft: left,
      });
    }
    const limited = await location(team[0]);
    expect(limited.result).toBe('rate_limited');
    expect(limited.retryAfter).toBeGreaterThanOrEqual(1);
    expect(await sql`SELECT 1 FROM app.coordinate_submissions`).toHaveLength(5);
    // Another team has its own counter, and a correct answer writes its row too.
    expect(await location(team[1])).toMatchObject({ result: 'correct' });
    expect(await sql`SELECT 1 FROM app.coordinate_submissions`).toHaveLength(6);
  });

  it('needs a running event and a configured answer, and works without any solve', async () => {
    await setStatus(sql, 'paused');
    expect(await location(team[0])).toEqual({ result: 'closed' });
    await setStatus(sql, 'running');
    await sql`UPDATE app.event_state SET coordinate_answer_hash = NULL`;
    expect(await location(team[0])).toEqual({ result: 'closed' });
    expect(await sql`SELECT 1 FROM app.coordinate_submissions`).toHaveLength(0);
    await setFinalAnswer(sql, ANSWER);
    expect(await sql`SELECT 1 FROM app.solves`).toHaveLength(0);
    expect(await location(team[0])).toMatchObject({ result: 'correct', winner: true });
  });

  it(
    'gives exactly one winner when 10 teams submit the right answer at once',
    { timeout: 240_000 },
    async () => {
      const teams = [...team];
      for (let i = teams.length; i < 10; i++) teams.push(await addTeam(`more${i}`));
      vi.resetModules();
      const list = await Promise.all(
        teams.map(async () => {
          vi.resetModules();
          return {
            route: await import('@/app/api/coordinates/submit/route'),
            client: await import('@/lib/db/client'),
          };
        }),
      );
      let results: { result: string; winner?: boolean }[];
      try {
        const responses = await Promise.all(
          list.map(({ route }, i) =>
            route.POST(
              request('/api/coordinates/submit', {
                method: 'POST',
                auth: teams[i].auth,
                body: { answer: ANSWER },
              }),
              params({}),
            ),
          ),
        );
        results = await Promise.all(responses.map((res) => res.json()));
      } finally {
        await Promise.all(list.map(({ client }) => client.db.$client.end()));
      }
      expect(results.every((r) => r.result === 'correct')).toBe(true);
      expect(results.filter((r) => r.winner)).toHaveLength(1);
      const [state] = await sql`SELECT coordinate_winner_id AS w FROM app.event_state`;
      const winnerIndex = results.findIndex((r) => r.winner);
      expect(state.w).toBe(teams[winnerIndex].id);
      expect(await sql`SELECT 1 FROM app.coordinate_submissions WHERE is_correct`).toHaveLength(10);
    },
  );
});

describe('leaderboard', () => {
  it('updates after each valid solve and carries only public fields', async () => {
    const row = async () =>
      (await board()).find((r: { teamName: string }) => r.teamName === 'Team t0');
    expect(await row()).toEqual({
      rank: 1,
      teamName: 'Team t0',
      total: 0,
      easySolved: 0,
      mediumSolved: 0,
      difficultSolved: 0,
      mainDone: false,
      coordinatesDone: false,
    });
    await flag(1, team[0]);
    expect(await row()).toMatchObject({ total: 50, easySolved: 1, mediumSolved: 0 });
    await flag(5, team[0]);
    expect(await row()).toMatchObject({ total: 125, easySolved: 1, mediumSolved: 1 });
    await flag(9, team[0]);
    expect(await row()).toMatchObject({ total: 225, difficultSolved: 1, mainDone: false });
    await flag(13, team[0]);
    expect(await row()).toMatchObject({ total: 425, mainDone: true, rank: 1 });
    await location(team[0]);
    expect(await row()).toMatchObject({ coordinatesDone: true });

    const raw = await (await stateGet()).text();
    for (const secret of [...FINAL, ...Object.values(FRAGMENTS), ANSWER, team[0].id]) {
      expect(raw).not.toContain(secret);
    }
    await flag(2, team[1], 'EYE{wrong}');
    expect(raw).not.toContain('EYE{wrong}');
  });
});

// Ranking (docs/08 §4), one tie-break at a time, each against the ones after it. Totals are made
// equal with adjustments dated long ago, so they never decide the last tie-break.
describe('ranking order', () => {
  const T = (minute: number) => `2026-03-01T10:${String(minute).padStart(2, '0')}:00Z`;
  let admin: string;

  async function setup(names: string[]) {
    await wipeAppTables(sql);
    for (let n = 1; n <= 13; n++) c[n] = await createChallenge(sql, n);
    const ids: Record<string, string> = {};
    for (const name of names) ids[name] = await createTeam(sql, name.toLowerCase());
    await createAdminSession(sql);
    admin = (await sql`SELECT id FROM app.users WHERE username = 'admin1'`)[0].id;
    return ids;
  }
  const solveAt = (teamId: string, n: number, at: string) =>
    sql`INSERT INTO app.solves (team_id, challenge_id, solved_at) VALUES (${teamId}, ${c[n].id}, ${at})`;
  const coordsAt = (teamId: string, at: string) =>
    sql`INSERT INTO app.coordinate_submissions (team_id, submitted_hash, is_correct, submitted_at)
      VALUES (${teamId}, 'h', true, ${at})`;
  // Brings every team to the same total with an adjustment from the distant past.
  async function equalise(ids: string[], target: number) {
    for (const id of ids) {
      const [{ total }] =
        await sql`SELECT total::float AS total FROM app.v_scoreboard WHERE team_id = ${id}`;
      if (total === target) continue;
      await sql`INSERT INTO app.score_transactions (team_id, category, points, reason, admin_id, created_at)
        VALUES (${id}, 'adjustment', ${target - total}, 'equalise', ${admin}, '2000-01-01T00:00:00Z')`;
    }
  }
  const order = async () =>
    (await board()).map((r: { teamName: string; rank: number }) => `${r.teamName}:${r.rank}`);

  it('1. highest total points beats everything else', async () => {
    const ids = await setup(['Low', 'High']);
    await coordsAt(ids.Low, T(1));
    await solveAt(ids.Low, 13, T(1));
    await equalise([ids.Low], 100);
    await sql`INSERT INTO app.score_transactions (team_id, category, points, reason, admin_id)
      VALUES (${ids.High}, 'adjustment', 101, 'lead', ${admin})`;
    expect(await order()).toEqual(['Team high:1', 'Team low:2']);
  });

  it('2. earliest coordinates found beats an earlier Main solve; teams without it sort last', async () => {
    const ids = await setup(['A', 'B', 'C']);
    await coordsAt(ids.A, T(5));
    await coordsAt(ids.B, T(9));
    await solveAt(ids.B, 13, T(1));
    await solveAt(ids.C, 13, T(0));
    await solveAt(ids.B, 9, T(2));
    await equalise(Object.values(ids), 500);
    expect(await order()).toEqual(['Team a:1', 'Team b:2', 'Team c:3']);
  });

  it('3. earliest Main solve beats more Difficult solved; no Main sorts last', async () => {
    const ids = await setup(['A', 'B', 'C']);
    await solveAt(ids.A, 13, T(3));
    await solveAt(ids.B, 13, T(7));
    await solveAt(ids.B, 9, T(1));
    await solveAt(ids.B, 10, T(2));
    for (const n of [9, 10, 11]) await solveAt(ids.C, n, T(n));
    await equalise(Object.values(ids), 800);
    expect(await order()).toEqual(['Team a:1', 'Team b:2', 'Team c:3']);
  });

  it('4. more Difficult solved beats more Medium solved', async () => {
    const ids = await setup(['A', 'B']);
    await solveAt(ids.A, 9, T(8));
    await solveAt(ids.A, 10, T(9));
    for (const n of [5, 6, 7]) await solveAt(ids.B, n, T(n));
    await solveAt(ids.B, 9, T(10));
    await equalise(Object.values(ids), 700);
    expect(await order()).toEqual(['Team a:1', 'Team b:2']);
  });

  it('5. more Medium solved beats an earlier final score', async () => {
    const ids = await setup(['A', 'B']);
    await solveAt(ids.A, 5, T(8));
    await solveAt(ids.A, 6, T(9));
    await solveAt(ids.B, 5, T(1));
    await equalise(Object.values(ids), 600);
    expect(await order()).toEqual(['Team a:1', 'Team b:2']);
  });

  it('6. earliest time the final score was reached, then a shared rank', async () => {
    const ids = await setup(['Early', 'Late', 'TwinA', 'TwinB']);
    await solveAt(ids.Late, 1, T(9));
    await solveAt(ids.Early, 1, T(2));
    await solveAt(ids.TwinA, 1, T(20));
    await solveAt(ids.TwinB, 1, T(20));
    await equalise(Object.values(ids), 400);
    // All four reached the same total; their last ledger rows are the solves.
    expect(await order()).toEqual(['Team early:1', 'Team late:2', 'Team twina:3', 'Team twinb:3']);
  });
});
