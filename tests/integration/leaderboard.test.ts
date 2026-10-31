// R8 acceptance: the public board, feed, freeze, and the after-commit board ping.
import { readFileSync } from 'node:fs';

import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as feedRoute } from '@/app/api/public/feed/route';
import { GET as stateRoute } from '@/app/api/public/state/route';
import { POST as flagRoute } from '@/app/api/challenges/[number]/submit/route';
import { POST as coordinateRoute } from '@/app/api/coordinates/submit/route';
import { POST as discoverRoute } from '@/app/api/surprises/[kind]/discover/route';
import { POST as surpriseRoute } from '@/app/api/surprises/[kind]/submit/route';
import { requireAdmin, requireTeam } from '@/lib/auth/guards';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
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

const spy = vi.hoisted(() => ({
  seen: [] as number[],
  probe: null as null | (() => Promise<number>),
  cookie: undefined as string | undefined,
}));

// Records how many ledger rows other connections could see when the ping fired.
vi.mock('@/lib/realtime/broadcast', async (orig) => ({
  ...(await orig<typeof import('@/lib/realtime/broadcast')>()),
  notifyBoard: async () => {
    spy.seen.push(await spy.probe!());
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (spy.cookie ? { value: spy.cookie } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const FINAL_ANSWER = 'Zyxwopolis';
const SURPRISE_ANSWER = 'zephyr quartz lantern';

let sql: postgres.Sql;
let teamA: string;
let authA: Auth;
let challenge1: TestChallenge;

beforeAll(() => {
  sql = openSql();
  spy.probe = async () => (await sql`SELECT count(*)::int AS n FROM app.score_transactions`)[0].n;
});

beforeEach(async () => {
  spy.seen = [];
  spy.cookie = undefined;
  await wipeAppTables(sql);
  teamA = await createTeam(sql, 'secretcode7');
  authA = await sessionFor(sql, 'secretcode7');
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

async function score(team: string, points: number, at = 'now()') {
  await sql`INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id, created_at)
    VALUES (${team}, 'challenge', ${points}, 'solve', gen_random_uuid(), ${sql.unsafe(at)})`;
}

const state = async () => (await stateRoute()).json();

describe('/api/public/state', () => {
  it('needs no session, ranks by total, shares ranks on ties and keeps fractions', async () => {
    const b = await createTeam(sql, 'tb');
    const c = await createTeam(sql, 'tc');
    const d = await createTeam(sql, 'td');
    await score(teamA, 59.5, "'2026-01-01T10:00:00Z'");
    await score(b, 100, "'2026-01-01T11:00:00Z'");
    await score(c, 59.5, "'2026-01-01T10:00:00Z'"); // ties with A on total and on time
    await score(d, 10);

    const res = await stateRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=1, stale-while-revalidate=5');
    const body = await res.json();
    expect(body.leaderboard.map((r: { teamName: string }) => r.teamName)).toEqual([
      'Team tb',
      'Team secretcode7',
      'Team tc',
      'Team td',
    ]);
    expect(body.leaderboard.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(body.leaderboard[1].total).toBe(59.5);
    expect(body.leaderboard[1]).toMatchObject({ mainDone: false, coordinatesDone: false });
    expect(body).toMatchObject({ status: 'running', frozen: false });
    expect(typeof body.serverTime).toBe('number');
  });

  it('hides hidden and inactive teams, and carries no team id or username', async () => {
    const hidden = await createTeam(sql, 'hiddenteam');
    const inactive = await createTeam(sql, 'inactiveteam');
    await sql`UPDATE app.teams SET is_hidden = true WHERE id = ${hidden}`;
    await sql`UPDATE app.teams SET is_active = false WHERE id = ${inactive}`;
    await score(hidden, 500);
    await score(inactive, 400);
    await score(teamA, 5);
    // The helper builds the name from the username; a real team's name is unrelated to its code.
    await sql`UPDATE app.teams SET name = 'Web Slingers' WHERE id = ${teamA}`;

    const raw = await (await stateRoute()).text();
    expect(JSON.parse(raw).leaderboard).toHaveLength(1);
    expect(raw).toContain('Web Slingers');
    for (const secret of [
      'secretcode7',
      hidden,
      inactive,
      teamA,
      'hiddenteam',
      'team_id',
      'username',
    ]) {
      expect(raw).not.toContain(secret);
    }
    const feedRaw = await (await feedRoute()).text();
    for (const secret of ['secretcode7', teamA, 'team_id']) expect(feedRaw).not.toContain(secret);
  });

  it('serves the snapshot while frozen, and the live board again after', async () => {
    await score(teamA, 10);
    const snap = [{ rank: 1, teamName: 'Frozen Team', total: 1 }];
    await sql`INSERT INTO app.scoreboard_snapshots (snapshot) VALUES (${sql.json(snap)})`;
    await sql`UPDATE app.event_state SET leaderboard_frozen = true`;

    expect((await state()).leaderboard).toEqual(snap);
    await score(teamA, 90);
    const frozen = await state();
    expect(frozen.frozen).toBe(true);
    expect(frozen.leaderboard).toEqual(snap);
    expect((await (await feedRoute()).json()).feed).toEqual([]);

    await sql`UPDATE app.event_state SET leaderboard_frozen = false`;
    expect((await state()).leaderboard[0].total).toBe(100);
  });
});

describe('/api/public/feed', () => {
  it('lists the latest solves with the cache header', async () => {
    challenge1 = await createChallenge(sql, 1);
    await sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${teamA}, ${challenge1.id})`;
    const res = await feedRoute();
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=1, stale-while-revalidate=5');
    const { feed } = await res.json();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ teamName: 'Team secretcode7', challengeNumber: 1 });
  });
});

describe('the board ping', () => {
  it('lets one broadcast through per window', async () => {
    const open = async () => (await sql`SELECT app.try_open_gate('board') AS open`)[0].open;
    expect([await open(), await open(), await open()]).toEqual([true, false, false]);
  });

  it('fires after the commit for a correct flag, not for a wrong one', async () => {
    challenge1 = await createChallenge(sql, 1);
    await regenerateVariants(db, {});
    const send = (flag: string) =>
      flagRoute(
        request('/api/challenges/1/submit', { method: 'POST', auth: authA, body: { flag } }),
        params({ number: '1' }),
      );

    expect((await (await send('SPIDEY{wrong}')).json()).result).toBe('wrong');
    expect(spy.seen).toEqual([]);
    expect((await (await send(flagOf(teamA, challenge1))).json()).result).toBe('correct');
    expect(spy.seen).toEqual([1]); // the ledger row was already visible to another connection
  });

  it('fires for a correct final location, not a wrong one', async () => {
    await setFinalAnswer(sql, FINAL_ANSWER);
    const send = (answer: string) =>
      coordinateRoute(
        request('/api/coordinates/submit', { method: 'POST', auth: authA, body: { answer } }),
        params({}),
      );

    expect((await (await send('Nowhere')).json()).result).toBe('wrong');
    expect(spy.seen).toEqual([]);
    expect((await (await send(FINAL_ANSWER)).json()).result).toBe('correct');
    expect(spy.seen).toHaveLength(1);
  });

  it('fires for a correct surprise answer, not a wrong one', async () => {
    await sql`UPDATE app.surprise_events
      SET enabled = true, answer_hash = ${hmacHex(env.FLAG_HMAC_KEY, `surprise:${SURPRISE_ANSWER}`)},
          answer_enc = 'x', content_html = '<p>task</p>' WHERE kind = 'spidey_signal'`;
    await discoverRoute(
      request('/api/surprises/spidey_signal/discover', { method: 'POST', auth: authA }),
      params({ kind: 'spidey_signal' }),
    );
    const send = (answer: string) =>
      surpriseRoute(
        request('/api/surprises/spidey_signal/submit', {
          method: 'POST',
          auth: authA,
          body: { answer },
        }),
        params({ kind: 'spidey_signal' }),
      );

    expect((await (await send('nope')).json()).result).toBe('wrong');
    expect(spy.seen).toEqual([]);
    expect((await (await send(SURPRISE_ANSWER)).json()).result).toBe('correct');
    expect(spy.seen).toEqual([1]);
  });
});

// Vitest here doesn't compile TSX, so the pages themselves can't be imported. Each page's first
// line calls its guard (asserted from the source), and the guard is exercised for real.
describe('page guards', () => {
  const source = (path: string) => readFileSync(path, 'utf8');

  it('/leaderboard needs a team session', async () => {
    expect(source('src/app/(team)/leaderboard/page.tsx')).toContain('await requireTeam()');
    await expect(requireTeam()).rejects.toThrow('REDIRECT /login');
    spy.cookie = authA.cookie;
    await expect(requireTeam()).resolves.toMatchObject({ teamName: 'Team secretcode7' });
  });

  it('/screen refuses a team and admits an admin', async () => {
    expect(source('src/app/screen/page.tsx')).toContain('await requireAdmin()');
    await expect(requireAdmin()).rejects.toThrow('REDIRECT /admin/login');
    spy.cookie = authA.cookie;
    await expect(requireAdmin()).rejects.toThrow('REDIRECT /dashboard');
    spy.cookie = (await createAdminSession(sql)).cookie;
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin' });
  });
});
