// R3 acceptance: what a team can read, per event status, through the real route handlers.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as regenerate } from '@/app/api/admin/challenges/[id]/regenerate/route';
import { GET as asset } from '@/app/api/challenges/[number]/assets/[asset]/route';
import { POST as hints } from '@/app/api/challenges/[number]/hints/route';
import { GET as detail } from '@/app/api/challenges/[number]/route';
import { POST as submit } from '@/app/api/challenges/[number]/submit/route';
import { GET as list } from '@/app/api/challenges/route';
import { GET as me } from '@/app/api/me/route';
import { GET as time } from '@/app/api/time/route';
import { GET as vault } from '@/app/vault/[slug]/route';
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
  setStatus,
  tokenOf,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

let sql: postgres.Sql;
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;
let easy: TestChallenge;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  teamA = await createTeam(sql, 'teama');
  teamB = await createTeam(sql, 'teamb');
  authA = await sessionFor(sql, 'teama');
  authB = await sessionFor(sql, 'teamb');
  easy = await createChallenge(sql, 1, {
    fragment: { value: '47', order: 3, clue: 'Clue three' },
    hints: ['First hint', 'Second hint'],
    evidence: [{ type: 'code', content: '{{token}}' }],
    generatorConfig: {
      surfaces: { headers: [{ name: 'x-spidey-clue', value: '{{token}}' }] },
      files: [{ name: 'clue.txt', content: 'token {{token}}' }],
    },
  });
  await regenerateVariants(db, {});
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

function getDetail(number: string | number, auth = authA) {
  return detail(request(`/api/challenges/${number}`, { auth }), params({ number: String(number) }));
}

function reveal(number: number, index: number, auth = authA) {
  return hints(
    request(`/api/challenges/${number}/hints`, { method: 'POST', auth, body: { index } }),
    params({ number: String(number) }),
  );
}

async function solve(challenge: TestChallenge, teamId: string, auth: Auth) {
  const res = await submit(
    request(`/api/challenges/${challenge.number}/submit`, {
      method: 'POST',
      auth,
      body: { flag: flagOf(teamId, challenge) },
    }),
    params({ number: String(challenge.number) }),
  );
  expect((await res.json()).result).toBe('correct');
}

async function cards(auth = authA) {
  const res = await list(request('/api/challenges', { auth }), params({}));
  return (await res.json()).challenges;
}

describe('GET /api/challenges', () => {
  it('lists cards with current points and never says which carry fragments', async () => {
    const body = await cards();
    expect(body.map((c: { number: number }) => c.number)).toEqual([1]);
    expect(body[0]).toEqual({
      number: 1,
      title: 'Challenge 1',
      difficulty: 'easy',
      basePoints: 50,
      currentPoints: 50,
      state: 'open',
      pointsEarned: null,
    });
    expect(JSON.stringify(body)).not.toMatch(/fragment|coordinate|clue|hash/i);
  });

  it('shows locks before the start, decaying points, solved state and closed at the end', async () => {
    await createChallenge(sql, 2);
    await setStatus(sql, 'not_started');
    let body = await cards();
    expect(body.map((c: { state: string }) => c.state)).toEqual(['locked', 'locked']);

    await setStatus(sql, 'running');
    await solve(easy, teamA, authA);
    body = await cards();
    // Team A's own solve counts as one earlier solve for whoever comes next.
    expect(body[0]).toMatchObject({ currentPoints: 49.5, state: 'solved', pointsEarned: 50 });
    expect(body[1]).toMatchObject({ currentPoints: 50, state: 'open' });
    expect((await cards(authB))[0]).toMatchObject({
      currentPoints: 49.5,
      state: 'open',
      pointsEarned: null,
    });

    await setStatus(sql, 'ended');
    body = await cards();
    expect(body[0].state).toBe('solved');
    expect(body[1].state).toBe('closed');
  });

  it('leaves out unpublished challenges', async () => {
    await createChallenge(sql, 2, { isPublished: false });
    expect(await cards()).toHaveLength(1);
  });
});

describe('GET /api/challenges/:n', () => {
  it("returns this team's own variant, and the fragment only after solving", async () => {
    const a = await (await getDetail(1)).json();
    const b = await (await getDetail(1, authB)).json();
    expect(Buffer.from(a.html.replace(/<\/?p>/g, ''), 'base64').toString()).toBe(
      flagOf(teamA, easy),
    );
    expect(a.html).not.toBe(b.html);
    expect(a.evidence).toEqual([{ type: 'code', content: tokenOf(teamA, easy) }]);
    expect(a).toMatchObject({ hintCount: 2, currentPoints: 50, solved: null });
    expect(JSON.stringify(a)).not.toMatch(/Clue three|expected|x-spidey/);
    expect(a.files).toEqual(['clue.txt']);

    await solve(easy, teamA, authA);
    const solved = await (await getDetail(1)).json();
    expect(solved.solved).toEqual({
      points: 50,
      fragment: '47',
      orderClue: 'Clue three',
      finalCoordinates: null,
    });
    // Same fragment for every team, and team B still hasn't earned it.
    const other = await (await getDetail(1, authB)).json();
    expect(other.solved).toBeNull();
    expect(other.currentPoints).toBe(49.5);
    expect(JSON.stringify(other)).not.toMatch(/Clue three/);
  });

  it('locks every challenge before the event starts', async () => {
    await setStatus(sql, 'not_started');
    const locked = await getDetail(1);
    expect(locked.status).toBe(423);
    const body = await locked.json();
    expect(body.error.code).toBe('locked');
    expect(JSON.stringify(body)).not.toContain(tokenOf(teamA, easy));
  });

  it('stays readable while paused and closes once the event has ended', async () => {
    await setStatus(sql, 'paused');
    expect((await getDetail(1)).status).toBe(200);
    await setStatus(sql, 'ended');
    const res = await getDetail(1);
    expect(res.status).toBe(423);
    expect((await res.json()).error.code).toBe('closed');
  });

  it.each(['0', '11', '99', 'abc', '01', '-1', '1.5'])('answers 404 for %s', async (number) => {
    expect((await getDetail(number)).status).toBe(404);
  });

  it('answers 404 for an unpublished challenge', async () => {
    await createChallenge(sql, 2, { isPublished: false });
    expect((await getDetail(2)).status).toBe(404);
  });
});

describe('hints', () => {
  it('returns the text and logs one reveal however often it is opened', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await reveal(1, 1);
      expect(await res.json()).toEqual({ hint: 'First hint' });
    }
    const rows = await sql`SELECT team_id, hint_order FROM app.hint_reveals`;
    expect(rows).toEqual([{ team_id: teamA, hint_order: 1 }]);
  });

  it('answers 404 for a hint that does not exist', async () => {
    expect((await reveal(1, 3)).status).toBe(404);
  });

  it('follows the event status', async () => {
    await setStatus(sql, 'not_started');
    expect((await reveal(1, 1)).status).toBe(423);
    await setStatus(sql, 'paused');
    expect((await reveal(1, 1)).status).toBe(200);
    await setStatus(sql, 'ended');
    expect((await reveal(1, 1)).status).toBe(423);
  });

  it('limits to 30 reveals in 60 s', async () => {
    await sql`
      INSERT INTO app.hint_reveals (team_id, challenge_id, hint_order)
      SELECT ${teamA}, ${easy.id}, n FROM generate_series(1, 30) n`;
    const res = await reveal(1, 1);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
  });
});

describe('per-team surfaces', () => {
  it('serves the file privately, per team', async () => {
    const res = await asset(
      request('/api/challenges/1/assets/clue.txt', { auth: authB }),
      params({ number: '1', asset: 'clue.txt' }),
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.text()).toBe(`token ${tokenOf(teamB, easy)}`);

    const missing = await asset(
      request('/api/challenges/1/assets/other.txt', { auth: authB }),
      params({ number: '1', asset: 'other.txt' }),
    );
    expect(missing.status).toBe(404);
  });

  it('sends the x-spidey header on the vault route, not while locked', async () => {
    const open = await vault(
      request('/vault/challenge-1', { auth: authA }),
      params({ slug: 'challenge-1' }),
    );
    expect(open.status).toBe(200);
    expect(open.headers.get('x-spidey-clue')).toBe(tokenOf(teamA, easy));

    await setStatus(sql, 'not_started');
    const locked = await vault(
      request('/vault/challenge-1', { auth: authA }),
      params({ slug: 'challenge-1' }),
    );
    expect(locked.status).toBe(404);
    expect(locked.headers.get('x-spidey-clue')).toBeNull();
  });
});

describe('GET /api/me', () => {
  async function getMe(auth = authA) {
    return (await me(request('/api/me', { auth }), params({}))).json();
  }

  it('reports score, rank, solves, status and the current point table', async () => {
    await solve(easy, teamA, authA);
    expect(await getMe()).toEqual({
      teamName: 'Team teama',
      score: 50,
      rank: 1,
      solved: [1],
      status: 'running',
      submissionsOpen: true,
      points: { 1: 49.5 },
    });
    expect(await getMe(authB)).toMatchObject({ score: 0, rank: 2, solved: [] });
  });

  it('hides the rank while frozen and for a hidden team', async () => {
    await sql`UPDATE app.event_state SET leaderboard_frozen = true`;
    expect((await getMe()).rank).toBeNull();
    await sql`UPDATE app.event_state SET leaderboard_frozen = false`;
    await sql`UPDATE app.teams SET is_hidden = true WHERE id = ${teamA}`;
    expect((await getMe()).rank).toBeNull();
  });
});

describe('GET /api/time', () => {
  it('returns the server clock, uncached', async () => {
    const res = await time(request('/api/time', { auth: authA }), params({}));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Math.abs((await res.json()).serverTime - Date.now())).toBeLessThan(5000);
  });
});

describe('POST /api/admin/challenges/:id/regenerate', () => {
  function post(id: string, auth: Auth) {
    return regenerate(
      request(`/api/admin/challenges/${id}/regenerate`, { method: 'POST', auth }),
      params({ id }),
    );
  }

  it('rewrites variants for every team, keeps solves, and writes the audit log', async () => {
    const admin = await createAdminSession(sql);
    await solve(easy, teamA, authA);
    await sql`
      UPDATE app.challenges SET question_template = 'New {{token}}', generator_version = 2
      WHERE id = ${easy.id}`;

    const res = await post(easy.id, admin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ regenerated: 2 });

    const variants = await sql`
      SELECT variant_data->>'html' AS html, generator_version FROM app.team_challenge_variants
      WHERE challenge_id = ${easy.id} AND team_id = ${teamB}`;
    expect(variants).toEqual([{ html: `New ${tokenOf(teamB, easy)}`, generator_version: 2 }]);
    expect(await sql`SELECT 1 FROM app.solves`).toHaveLength(1);

    const [entry] = await sql`SELECT action, entity_id, details FROM app.audit_log`;
    expect(entry).toEqual({
      action: 'challenge.regenerate_variants',
      entity_id: easy.id,
      details: { variants: 2 },
    });
  });

  it('refuses a bad template with its reason and changes nothing', async () => {
    const admin = await createAdminSession(sql);
    await sql`UPDATE app.challenges SET question_template = '{{nope}}' WHERE id = ${easy.id}`;
    const res = await post(easy.id, admin);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('bad_template');
    expect(await sql`SELECT 1 FROM app.audit_log`).toHaveLength(0);
  });

  it('answers 404 for an unknown or malformed id, and 403 to a team', async () => {
    const admin = await createAdminSession(sql);
    expect((await post('00000000-0000-4000-8000-000000000000', admin)).status).toBe(404);
    expect((await post('nope', admin)).status).toBe(404);
    expect((await post(easy.id, authA)).status).toBe(403);
  });
});
