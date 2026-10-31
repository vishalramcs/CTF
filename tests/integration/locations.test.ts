// R4 acceptance: docs/07 §4 locations and Cosmic Keys, through the real route handlers.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as submit } from '@/app/api/locations/[level]/submit/route';
import { GET as list } from '@/app/api/locations/route';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { normalizeLocation } from '@/lib/locations/normalize';
import {
  createChallenge,
  createTeam,
  openSql,
  params,
  request,
  sessionFor,
  setStatus,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

const ANSWERS = {
  easy: 'Zyxwopolis',
  medium: 'Qwertyville',
  difficult: 'Plughburg',
  main_difficult: 'Vortexcity',
};
type Level = keyof typeof ANSWERS;
const LEVELS = Object.keys(ANSWERS) as Level[];
const hashOf = (level: Level) => hmacHex(env.COORD_HMAC_KEY, normalizeLocation(ANSWERS[level])!);
const cipherOf = (level: Level) => `CIPHERTEXT-${level}`;

// Fragments on 1-4, 5 and 7, 8 and 9, 10. Challenge 6 carries none.
const FRAGMENT_CHALLENGES = [1, 2, 3, 4, 5, 7, 8, 9, 10];
const fragmentValue = (number: number) => `FRAGVALUE${number}`;

let sql: postgres.Sql;
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;
let challenge: Record<number, TestChallenge>;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  teamA = await createTeam(sql, 'teama');
  teamB = await createTeam(sql, 'teamb');
  authA = await sessionFor(sql, 'teama');
  authB = await sessionFor(sql, 'teamb');
  challenge = {};
  for (let number = 1; number <= 10; number++) {
    challenge[number] = await createChallenge(sql, number, {
      fragment: FRAGMENT_CHALLENGES.includes(number)
        ? { value: fragmentValue(number), order: number, clue: `FRAGCLUE${number}` }
        : undefined,
    });
  }
  for (const level of LEVELS) {
    await sql`UPDATE app.locations
      SET answer_hash = ${hashOf(level)}, answer_enc = ${cipherOf(level)}
      WHERE level = ${level}::app.challenge_difficulty`;
  }
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

// Solves go straight in: the flag path has its own tests, and the database trigger still runs.
async function solve(team: string, ...numbers: readonly number[]) {
  for (const number of numbers) {
    await sql`INSERT INTO app.solves (team_id, challenge_id)
      VALUES (${team}, ${challenge[number].id})`;
  }
}

async function send(level: string, answer: string, auth = authA) {
  const res = await submit(
    request(`/api/locations/${level}/submit`, { method: 'POST', auth, body: { answer } }),
    params({ level }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

async function view(auth = authA) {
  const res = await list(request('/api/locations', { auth }), params(undefined));
  expect(res.status).toBe(200);
  return res.text();
}
const levelView = async (level: Level, auth = authA) =>
  JSON.parse(await view(auth)).locations.find((l: { level: string }) => l.level === level);

const payouts = () => sql`
  SELECT team_id, points::text AS points, ref_type FROM app.score_transactions
   WHERE category = 'location' ORDER BY id`;
const attempts = () => sql`
  SELECT is_correct, submitted_hash FROM app.location_submissions ORDER BY id`;
const achievements = () => sql`SELECT team_id, location_id FROM app.location_achievements`;
const keys = () => sql`SELECT team_id, key_id FROM app.team_cosmic_keys`;

describe('unlock rules', () => {
  it('easy: 1 solve stays locked, any 2 of the 4 unlock', async () => {
    await solve(teamA, 1);
    expect(await send('easy', ANSWERS.easy)).toEqual({
      result: 'locked',
      fragmentsHeld: 1,
      fragmentsRequired: 2,
    });
    expect((await levelView('easy')).unlocked).toBe(false);
    expect(await attempts()).toHaveLength(0);

    await solve(teamA, 3);
    expect((await levelView('easy')).unlocked).toBe(true);
    expect((await send('easy', ANSWERS.easy)).result).toBe('correct');
  });

  it('medium: #5 and #6 hold one fragment and stay locked, then #7 unlocks', async () => {
    await solve(teamA, 5, 6);
    expect(await send('medium', ANSWERS.medium)).toEqual({
      result: 'locked',
      fragmentsHeld: 1,
      fragmentsRequired: 2,
    });
    expect((await levelView('medium')).fragments).toHaveLength(1);

    await solve(teamA, 7);
    expect((await send('medium', ANSWERS.medium)).result).toBe('correct');
  });

  it('hard needs both challenges', async () => {
    await solve(teamA, 8);
    expect((await send('difficult', ANSWERS.difficult)).result).toBe('locked');
    await solve(teamA, 9);
    expect((await send('difficult', ANSWERS.difficult)).result).toBe('correct');
  });

  it('main needs its one challenge', async () => {
    expect(await send('main_difficult', ANSWERS.main_difficult)).toEqual({
      result: 'locked',
      fragmentsHeld: 0,
      fragmentsRequired: 1,
    });
    await solve(teamA, 10);
    expect((await send('main_difficult', ANSWERS.main_difficult)).result).toBe('correct');
  });

  it('counts only fragments of the same level', async () => {
    await solve(teamA, 1, 2, 5);
    expect((await send('medium', ANSWERS.medium)).result).toBe('locked');
  });
});

describe('correct answer', () => {
  it.each([
    ['easy', [1, 3], 180, 'Easy Cosmic Key', false],
    ['medium', [5, 7], 330, 'Medium Cosmic Key', false],
    ['difficult', [8, 9], 525, 'Hard Cosmic Key', false],
    ['main_difficult', [10], 1200, 'Main Cosmic Key', true],
  ] as const)(
    '%s pays once, gives its key, and shows on the scoreboard',
    async (level, solved, points, keyName, finalMission) => {
      await solve(teamA, ...solved);
      expect(await send(level, ANSWERS[level])).toEqual({
        result: 'correct',
        points,
        key: { name: keyName },
        finalMission,
      });

      expect(await payouts()).toEqual([
        { team_id: teamA, points: points.toFixed(1), ref_type: 'location' },
      ]);
      const [board] = await sql`
        SELECT location_points::text AS location_points, locations, keys
          FROM app.v_scoreboard WHERE team_id = ${teamA}`;
      expect(board).toEqual({ location_points: points.toFixed(1), locations: 1, keys: 1 });

      const shown = await levelView(level);
      expect(shown).toMatchObject({ completed: true, rewardPoints: points });
      expect(shown.achievedAt).toEqual(expect.any(String));
      expect(shown.key).toEqual({ name: keyName, acquiredAt: expect.any(String) });

      expect(await send(level, ANSWERS[level])).toEqual({ result: 'already_completed' });
      expect(await send(level, 'something else')).toEqual({ result: 'already_completed' });
      expect(await payouts()).toHaveLength(1);
      expect(await achievements()).toHaveLength(1);
      expect(await keys()).toHaveLength(1);
      expect(await attempts()).toHaveLength(1);
    },
  );

  it('matches loosely on case, space and punctuation', async () => {
    await solve(teamA, 1, 3);
    expect((await send('easy', `  ${ANSWERS.easy.toUpperCase()}. `)).result).toBe('correct');
  });

  it('pays each team its own reward', async () => {
    await solve(teamA, 1, 3);
    await solve(teamB, 2, 4);
    await send('easy', ANSWERS.easy);
    expect((await send('easy', ANSWERS.easy, authB)).points).toBe(180);
    expect((await payouts()).map((row) => row.team_id)).toEqual([teamA, teamB]);
  });
});

describe('wrong answer', () => {
  beforeEach(() => solve(teamA, 1, 3));

  it('costs nothing and stores only a hash', async () => {
    expect(await send('easy', 'Nowhere')).toEqual({ result: 'wrong', attemptsLeft: 4 });
    expect(await payouts()).toHaveLength(0);
    const [attempt] = await attempts();
    expect(attempt.is_correct).toBe(false);
    expect(attempt.submitted_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await send('easy', ANSWERS.easy)).points).toBe(180);
  });

  it.each(['', '  ', '...', '\0'])('logs malformed %j as wrong with no hash', async (answer) => {
    expect(await send('easy', answer)).toEqual({ result: 'wrong', attemptsLeft: 4 });
    expect(await attempts()).toEqual([{ is_correct: false, submitted_hash: '' }]);
  });

  it('limits the 6th wrong in 60 s, even for the right answer, per team and location', async () => {
    for (const left of [4, 3, 2, 1, 0]) {
      expect(await send('easy', 'Nowhere')).toEqual({ result: 'wrong', attemptsLeft: left });
    }
    const limited = await send('easy', 'Nowhere');
    expect(limited.result).toBe('rate_limited');
    expect(limited.retryAfter).toBeGreaterThanOrEqual(1);
    expect(limited.retryAfter).toBeLessThanOrEqual(60);
    expect((await send('easy', ANSWERS.easy)).result).toBe('rate_limited');
    expect(await attempts()).toHaveLength(5);
    expect(await payouts()).toHaveLength(0);

    await solve(teamA, 10);
    await solve(teamB, 2, 4);
    expect((await send('main_difficult', 'Nowhere')).result).toBe('wrong');
    expect((await send('easy', 'Nowhere', authB)).result).toBe('wrong');

    await sql`UPDATE app.location_submissions SET submitted_at = now() - interval '61 seconds'`;
    expect((await send('easy', ANSWERS.easy)).result).toBe('correct');
  });
});

describe('closed', () => {
  beforeEach(() => solve(teamA, 1, 3));

  it.each(['not_started', 'paused', 'ended'] as const)('closes while %s', async (status) => {
    await setStatus(sql, status);
    expect(await send('easy', ANSWERS.easy)).toEqual({ result: 'closed' });
    expect(await attempts()).toHaveLength(0);
    expect(await payouts()).toHaveLength(0);
  });

  it('closes when submissions are switched off', async () => {
    await sql`UPDATE app.event_state SET submissions_open = false`;
    expect(await send('easy', ANSWERS.easy)).toEqual({ result: 'closed' });
  });

  it('closes a location with no answer configured', async () => {
    await sql`UPDATE app.locations SET answer_hash = NULL WHERE level = 'easy'`;
    expect(await send('easy', ANSWERS.easy)).toEqual({ result: 'closed' });
    expect(await attempts()).toHaveLength(0);
  });
});

describe('routes', () => {
  const post = (level: string, answer: string, auth: Auth) =>
    submit(
      request(`/api/locations/${level}/submit`, { method: 'POST', auth, body: { answer } }),
      params({ level }),
    );

  it('gives 404 for an unknown level and 400 for a long answer', async () => {
    expect((await post('impossible', 'x', authA)).status).toBe(404);
    expect((await post('easy', 'x'.repeat(201), authA)).status).toBe(400);
  });

  it('needs a session and a CSRF token', async () => {
    expect((await list(request('/api/locations'), params(undefined))).status).toBe(401);
    expect((await post('easy', 'x', { ...authA, csrf: 'wrong' })).status).toBe(403);
  });
});

describe('what a team sees', () => {
  it('lists the four levels in order with the exact fields', async () => {
    await solve(teamA, 1);
    const { locations } = JSON.parse(await view());
    expect(locations.map((l: { level: string }) => l.level)).toEqual(LEVELS);
    expect(locations[0]).toEqual({
      level: 'easy',
      name: '',
      rewardPoints: 180,
      fragmentsRequired: 2,
      fragments: [
        { label: 'F1', value: fragmentValue(1), orderClue: 'FRAGCLUE1', challengeNumber: 1 },
      ],
      unlocked: false,
      completed: false,
      achievedAt: null,
      key: null,
    });
  });

  it('shows a team only its own fragments and achievements', async () => {
    await solve(teamA, 1, 3);
    await solve(teamB, 2);
    await send('easy', ANSWERS.easy);

    const a = await levelView('easy');
    expect(a.fragments.map((f: { challengeNumber: number }) => f.challengeNumber)).toEqual([1, 3]);
    const b = await levelView('easy', authB);
    expect(b.fragments.map((f: { challengeNumber: number }) => f.challengeNumber)).toEqual([2]);
    expect(b).toMatchObject({ unlocked: false, completed: false, achievedAt: null, key: null });
  });

  it('never leaks an answer, hash, ciphertext or unearned fragment', async () => {
    await solve(teamA, 1, 3);
    await send('easy', ANSWERS.easy);
    const body = await view();
    expect(body).toContain(fragmentValue(1));

    for (const level of LEVELS) {
      expect(body.toLowerCase()).not.toContain(ANSWERS[level].toLowerCase());
      expect(body).not.toContain(hashOf(level));
      expect(body).not.toContain(cipherOf(level));
    }
    for (const number of FRAGMENT_CHALLENGES.filter((n) => n !== 1 && n !== 3)) {
      expect(body).not.toContain(fragmentValue(number));
      expect(body).not.toContain(`FRAGCLUE${number}`);
      expect(body).not.toContain(`"F${number}"`);
    }
    expect(body).not.toMatch(/answer|hash|_enc/i);
  });
});

describe('races across separate server instances', () => {
  it(
    '10 parallel correct submits give one achievement, one ledger row and one key',
    { timeout: 240_000 },
    async () => {
      await solve(teamA, 1, 3);
      // Each fresh module graph gets its own connection, like separate serverless instances.
      const instances = await Promise.all(
        Array.from({ length: 10 }, async () => {
          vi.resetModules();
          return {
            route: await import('@/app/api/locations/[level]/submit/route'),
            client: await import('@/lib/db/client'),
          };
        }),
      );
      try {
        const responses = await Promise.all(
          instances.map(({ route }) =>
            route.POST(
              request('/api/locations/easy/submit', {
                method: 'POST',
                auth: authA,
                body: { answer: ANSWERS.easy },
              }),
              params({ level: 'easy' }),
            ),
          ),
        );
        const results = await Promise.all(responses.map((res) => res.json()));
        const counts = Object.groupBy(results, (r) => r.result);
        expect(counts.correct).toHaveLength(1);
        expect(counts.already_completed).toHaveLength(9);
      } finally {
        await Promise.all(instances.map(({ client }) => client.db.$client.end()));
      }
      expect(await achievements()).toHaveLength(1);
      expect(await payouts()).toHaveLength(1);
      expect(await keys()).toHaveLength(1);
      expect(await attempts()).toHaveLength(1);
    },
  );
});
