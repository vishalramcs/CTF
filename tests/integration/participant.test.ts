// R6: the participant read paths, through the real route handler and helper.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as announcementsGet } from '@/app/api/announcements/route';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { getTeamHistory } from '@/lib/participant/history';
import {
  createChallenge,
  createTeam,
  openSql,
  params,
  request,
  sessionFor,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

let sql: postgres.Sql;
let team: string;
let auth: Auth;
let challenge: TestChallenge;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  team = await createTeam(sql, 'teama');
  auth = await sessionFor(sql, 'teama');
  challenge = await createChallenge(sql, 1);
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

const get = (a?: Auth) =>
  announcementsGet(request('/api/announcements', { auth: a }), params(undefined));

describe('GET /api/announcements', () => {
  it('needs a team session', async () => {
    expect((await get()).status).toBe(401);
  });

  it('returns unexpired messages newest first, as stored', async () => {
    await sql`INSERT INTO app.announcements (message, created_at, expires_at) VALUES
      ('old', now() - interval '3 minutes', NULL),
      ('<b>new & bold</b>', now() - interval '1 minute', now() + interval '1 hour'),
      ('expired', now() - interval '2 minutes', now() - interval '1 second')`;
    const res = await get(auth);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.announcements.map((a: { message: string }) => a.message)).toEqual([
      '<b>new & bold</b>',
      'old',
    ]);
    expect(Object.keys(body.announcements[0]).sort()).toEqual(['createdAt', 'message']);
  });

  it('limits to 5', async () => {
    for (let i = 0; i < 7; i++) {
      await sql`INSERT INTO app.announcements (message, created_at)
        VALUES (${`m${i}`}, now() - ${i} * interval '1 minute')`;
    }
    const body = await (await get(auth)).json();
    expect(body.announcements).toHaveLength(5);
    expect(body.announcements[0].message).toBe('m0');
  });
});

describe('getTeamHistory', () => {
  it('lists completions in time order and wrong attempts as counts only', async () => {
    await sql`INSERT INTO app.solves (team_id, challenge_id, solved_at)
      VALUES (${team}, ${challenge.id}, now() - interval '2 minutes')`;
    for (const text of ['SECRETGUESS1', 'SECRETGUESS2']) {
      await sql`INSERT INTO app.submissions (team_id, challenge_id, submitted_hash, submitted_preview, is_correct, result)
        VALUES (${team}, ${challenge.id}, ${text}, ${text}, false, 'wrong')`;
    }

    const history = await getTeamHistory(team);
    expect(history.entries.map((e) => e.type)).toEqual(['challenge']);
    expect(history.entries[0]).toMatchObject({ number: 1, position: 1 });
    expect(history.wrongAttempts).toEqual([{ number: 1, title: 'Challenge 1', count: 2 }]);
    expect(JSON.stringify(history)).not.toContain('SECRETGUESS');
  });

  it('is empty for a new team', async () => {
    expect(await getTeamHistory(team)).toEqual({ entries: [], wrongAttempts: [] });
  });
});
