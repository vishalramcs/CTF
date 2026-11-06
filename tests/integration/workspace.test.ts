// The MJ Archive: the simulated workspace, its flag, and the sealed question it unlocks, through the
// real route handlers. Its flag is shared by all teams, so the test sets it the way the admin route does.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getChallenge } from '@/app/api/challenges/[number]/route';
import { POST as hints } from '@/app/api/challenges/[number]/hints/route';
import { POST as submit } from '@/app/api/challenges/[number]/submit/route';
import { POST as remove } from '@/app/api/challenges/[number]/workspace/files/[file]/delete/route';
import { GET as getFile } from '@/app/api/challenges/[number]/workspace/files/[file]/route';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { normalizeFlag } from '@/lib/flags/normalize';
import { listChallengeCards } from '@/lib/scoring/team-state';
import { getWorkspaceState } from '@/lib/workspace/state';
import { parseCsv } from '@/lib/workspace/definitions';
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

const FLAG = `${env.FLAG_PREFIX}{j.jameson_ed}`;
const WS = '/api/challenges/5/workspace/files';

let sql: postgres.Sql;
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;
let q9: string;

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
    questionTemplate: '<p>Which account was responsible?</p>',
    generatorConfig: { workspace: 'mj-archive' },
  });
  ({ id: q9 } = await createChallenge(sql, 9, { hints: ['A sealed hint'] }));
  await sql`UPDATE app.challenges SET requires_unlock = true WHERE id = ${q9}`;
  await sql`UPDATE app.challenges
    SET flag_mode = 'static', flag_template = NULL,
        static_flag_hash = ${hmacHex(env.FLAG_HMAC_KEY, normalizeFlag(FLAG, env.FLAG_PREFIX)!)}
    WHERE number = 5`;
  await regenerateVariants(db, {});
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

const open = (file: string, auth = authA, number = '5') =>
  getFile(request(`${WS}/${encodeURIComponent(file)}`, { auth }), params({ number, file }));
const del = (file: string, auth = authA, number = '5') =>
  remove(request(`${WS}/${file}/delete`, { method: 'POST', auth }), params({ number, file }));
const sendFlag = async (flag: string, auth = authA, number = '5') =>
  submit(
    request(`/api/challenges/${number}/submit`, { method: 'POST', auth, body: { flag } }),
    params({ number }),
  );
const view = (number: string, auth = authA) =>
  getChallenge(request(`/api/challenges/${number}`, { auth }), params({ number }));
const score = async (team: string) => {
  const [row] = await sql`SELECT COALESCE(SUM(points), 0)::text AS total
    FROM app.score_transactions WHERE team_id = ${team}`;
  return Number(row.total);
};

describe('evidence', () => {
  it('serves the five-page PDF and every listed file to a signed-in team', async () => {
    const { files } = (await getWorkspaceState(teamA, 'mj-archive'))!;
    expect(files.map((f) => f.key)).toEqual([
      'MJ_Newspaper.pdf',
      'archive_access.csv',
      'revision_history.json',
      'authentication.log',
      'editor_notes.txt',
      'photo_01.jpg',
      'photo_02.jpg',
      'old_draft.tmp',
      'mj_cache.tmp',
    ]);
    for (const { key } of files) expect((await open(key)).status).toBe(200);

    const pdf = await open('MJ_Newspaper.pdf');
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    const bytes = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
    expect(bytes.match(/\/Type\s*\/Page\b/g)).toHaveLength(5);
  });

  it('leads from 09:22 through S-044 to one account, with no conflicting record', async () => {
    const text = async (file: string) => (await open(file)).text();
    const rows = parseCsv(await text('archive_access.csv')).slice(1);
    const changes = rows.filter((r) => r[2] === 'MODIFY' && r[3] === 'NY-204');
    expect(changes).toEqual([['09:22', 'S-044', 'MODIFY', 'NY-204']]);

    const { revisions } = JSON.parse(await text('revision_history.json'));
    expect(revisions.filter((r: { article: string }) => r.article === 'NY-204')).toEqual([
      { article: 'NY-204', session: 'S-044', timestamp: '09:22', action: 'CONTENT_MODIFIED' },
    ]);

    const logins = (await text('authentication.log')).split(/\r?\n/);
    expect(logins.filter((l) => l.includes('session=S-044'))).toEqual([
      '09:17 LOGIN_SUCCESS account=j.jameson_ed session=S-044',
    ]);
  });

  it('refuses anything outside the list, and refuses signed-out requests', async () => {
    for (const file of ['../../../../.env.local', '..\\secrets', '.env', 'MJ_Newspaper.PDF', '']) {
      expect((await open(file)).status).toBe(404);
      expect((await del(file)).status).toBe(404);
    }
    const anon = await getFile(
      request(`${WS}/mj_cache.tmp`),
      params({ number: '5', file: 'mj_cache.tmp' }),
    );
    expect(anon.status).toBe(401);
  });

  it('only serves a workspace on the question that has one', async () => {
    await sql`UPDATE app.team_challenge_variants SET generator_version = generator_version`;
    await sql`INSERT INTO app.team_challenge_unlocks (team_id, challenge_id, source)
      VALUES (${teamA}, ${q9}, 'test')`;
    expect((await open('MJ_Newspaper.pdf', authA, '9')).status).toBe(404);
  });

  it('closes the files when the event is not open', async () => {
    await setStatus(sql, 'not_started');
    expect((await open('MJ_Newspaper.pdf')).status).toBe(404);
  });
});

describe('flag', () => {
  it('awards points once, and rejects a wrong flag without points', async () => {
    const wrong = await (await sendFlag(`${env.FLAG_PREFIX}{editor}`)).json();
    expect(wrong.result).toBe('wrong');
    expect(await score(teamA)).toBe(0);

    const right = await (await sendFlag(FLAG)).json();
    expect(right.result).toBe('correct');
    const earned = await score(teamA);
    expect(earned).toBeGreaterThan(0);

    expect((await (await sendFlag(FLAG)).json()).result).toBe('already_solved');
    expect(await score(teamA)).toBe(earned);
  });

  it('accepts the flag in any letter case, with surrounding spaces', async () => {
    const res = await sendFlag(`  ${FLAG.toLowerCase()}\n`);
    expect((await res.json()).result).toBe('correct');
  });

  it('gives the coordinate fragment an admin configured, to the solving team only', async () => {
    await sql`UPDATE app.challenges
      SET fragment_value = '76.', coordinate_order = 3, order_clue = 'Clue' WHERE number = 5`;
    expect((await (await view('5')).json()).solved).toBeNull();
    expect((await (await sendFlag(FLAG)).json()).fragment).toBe('76.');
    expect((await (await view('5')).json()).solved.fragment).toBe('76.');
    expect((await (await view('5', authB)).json()).solved).toBeNull();
  });
});

describe('sealed question', () => {
  it('is hidden on every read and write path until unlocked', async () => {
    const res = await view('9');
    expect(res.status).toBe(423);
    expect((await res.json()).error.code).toBe('sealed');

    const [card] = (await listChallengeCards(teamA, 'running')).filter((c) => c.number === 9);
    expect(card).toMatchObject({ state: 'sealed', title: 'Sealed trail' });

    expect((await sendFlag('EYE{anything}', authA, '9')).status).toBe(404);
    const hint = await hints(
      request('/api/challenges/9/hints', { method: 'POST', auth: authA, body: { index: 1 } }),
      params({ number: '9' }),
    );
    expect(hint.status).toBe(404);
  });

  it('deleting old_draft.tmp removes it but unlocks nothing', async () => {
    const res = await del('old_draft.tmp');
    expect(res.status).toBe(200);
    const state = await res.json();
    expect(state.unlock).toEqual({ number: 9, unlocked: false });
    expect(state.files.map((f: { key: string }) => f.key)).not.toContain('old_draft.tmp');
    expect((await open('old_draft.tmp')).status).toBe(410);
    expect((await view('9')).status).toBe(423);
  });

  it('deleting mj_cache.tmp unlocks it, and the unlock survives a new session', async () => {
    const res = await del('mj_cache.tmp');
    expect(res.status).toBe(200);
    expect((await res.json()).unlock).toEqual({ number: 9, unlocked: true });
    expect((await view('9')).status).toBe(200);

    const fresh = await sessionFor(sql, 'teama');
    expect((await view('9', fresh)).status).toBe(200);
    expect((await getWorkspaceState(teamA, 'mj-archive'))!.unlock?.unlocked).toBe(true);
  });

  it('a repeat or parallel delete unlocks once', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => del('mj_cache.tmp')));
    for (const res of results) expect(res.status).toBe(200);
    const rows = await sql`SELECT 1 FROM app.team_challenge_unlocks WHERE team_id = ${teamA}`;
    expect(rows).toHaveLength(1);
  });

  it('protected evidence cannot be deleted', async () => {
    for (const file of ['MJ_Newspaper.pdf', 'authentication.log', 'photo_01.jpg']) {
      expect((await del(file)).status).toBe(403);
      expect((await open(file)).status).toBe(200);
    }
  });

  it('no deletion or unlock while submissions are closed', async () => {
    await sql`UPDATE app.event_state SET submissions_open = false`;
    expect((await del('mj_cache.tmp')).status).toBe(423);
    expect((await view('9')).status).toBe(423);
  });

  it('does not touch any real file', async () => {
    expect((await del('mj_cache.tmp')).status).toBe(200);
    const fresh = await sessionFor(sql, 'teamb');
    expect((await open('mj_cache.tmp', fresh)).status).toBe(200);
  });
});

describe('independent progress', () => {
  it('completing Q5 does not unlock Q9', async () => {
    await sendFlag(FLAG);
    expect((await view('9')).status).toBe(423);
    expect((await getWorkspaceState(teamA, 'mj-archive'))!.unlock?.unlocked).toBe(false);
  });

  it('unlocking Q9 does not complete Q5 or award points', async () => {
    await del('mj_cache.tmp');
    expect((await (await view('5')).json()).solved).toBeNull();
    expect(await score(teamA)).toBe(0);
  });

  it('works in either order', async () => {
    await sendFlag(FLAG);
    await del('mj_cache.tmp');
    await del('mj_cache.tmp', authB);
    await sendFlag(FLAG, authB);
    for (const auth of [authA, authB]) {
      expect((await view('9', auth)).status).toBe(200);
      expect((await (await view('5', auth)).json()).solved).not.toBeNull();
    }
  });

  it('one team never affects another', async () => {
    await del('mj_cache.tmp');
    await sendFlag(FLAG);
    expect((await view('9', authB)).status).toBe(423);
    expect((await (await view('5', authB)).json()).solved).toBeNull();
    expect(await score(teamB)).toBe(0);
    expect((await open('mj_cache.tmp', authB)).status).toBe(200);
    expect((await open('mj_cache.tmp', authA)).status).toBe(410);
  });

  it('an event reset clears deletions and unlocks', async () => {
    await del('mj_cache.tmp');
    await sql`DELETE FROM app.team_challenge_unlocks`;
    await sql`DELETE FROM app.workspace_deletions`;
    expect((await open('mj_cache.tmp')).status).toBe(200);
    expect((await view('9')).status).toBe(423);
  });
});
