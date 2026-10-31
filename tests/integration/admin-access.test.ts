// R7: who may call the admin API, and what its responses may contain.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as audit } from '@/app/api/admin/audit/route';
import { GET as challengeGet } from '@/app/api/admin/challenges/[id]/route';
import { GET as challenges } from '@/app/api/admin/challenges/route';
import { GET as developers } from '@/app/api/admin/developers/route';
import { GET as event } from '@/app/api/admin/event/route';
import { GET as exportCsv } from '@/app/api/admin/export/route';
import { GET as locations } from '@/app/api/admin/locations/route';
import { GET as monitor } from '@/app/api/admin/monitor/route';
import { GET as overview } from '@/app/api/admin/overview/route';
import { GET as surprises } from '@/app/api/admin/surprises/route';
import { GET as teamGet } from '@/app/api/admin/teams/[id]/route';
import { GET as teams } from '@/app/api/admin/teams/route';
import { toCsv } from '@/lib/admin/csv';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import {
  call,
  createAdmin,
  createChallenge,
  createTeam,
  ok,
  openSql,
  sessionFor,
  type Auth,
} from './admin-helpers';

// Vite expands this at build time, so a new route file can't be forgotten. Its types aren't loaded here.
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const routes = import.meta.glob('/src/app/api/admin/**/route.ts');
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const IDS = { id: '00000000-0000-4000-8000-000000000000', level: 'easy', kind: 'spidey_signal' };
// Everything under /developers and the reset need SUPER_ADMIN.
const SUPER_ONLY = [
  ['/src/app/api/admin/developers/route.ts', 'GET'],
  ['/src/app/api/admin/developers/route.ts', 'POST'],
  ['/src/app/api/admin/developers/[id]/route.ts', 'DELETE'],
  ['/src/app/api/admin/event/reset/route.ts', 'POST'],
];

let sql: postgres.Sql;
let team: Auth;
let developer: Auth;
let superAdmin: Auth;
let teamId: string;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  teamId = await createTeam(sql, 'teama');
  team = await sessionFor(sql, 'teama');
  developer = await createAdmin(sql, 'dev1', 'developer');
  superAdmin = await createAdmin(sql, 'root1', 'super_admin');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

describe('guards', () => {
  it('finds the routes on disk', () => {
    expect(Object.keys(routes).length).toBeGreaterThan(30);
  });

  it('every /api/admin route: anonymous 401, team session 403', async () => {
    for (const [file, load] of Object.entries(routes)) {
      const mod = (await load()) as Record<string, unknown>;
      const methods = METHODS.filter((m) => typeof mod[m] === 'function');
      expect(methods.length, file).toBeGreaterThan(0);
      for (const method of methods) {
        const handler = mod[method] as Parameters<typeof call>[0];
        const anonymous = await call(handler, '/api/admin/x', { method, ctx: IDS });
        expect(anonymous.status, `${method} ${file} anonymous`).toBe(401);
        const asTeam = await call(handler, '/api/admin/x', { method, auth: team, ctx: IDS });
        expect(asTeam.status, `${method} ${file} team`).toBe(403);
      }
    }
  });

  it('a developer gets 403 on every super-admin route, a super admin gets in', async () => {
    for (const [file, method] of SUPER_ONLY) {
      const mod = (await routes[file]()) as Record<string, Parameters<typeof call>[0]>;
      const res = await call(mod[method], '/api/admin/x', {
        method,
        auth: developer,
        ctx: IDS,
        body: { confirm: 'RESET' },
      });
      expect(res.status, `${method} ${file}`).toBe(403);
    }
    expect(
      (await ok(await call(developers, '/api/admin/developers', { auth: superAdmin }))).developers,
    ).toEqual([expect.objectContaining({ username: 'dev1' })]);
  });

  it('a developer can use the shared routes', async () => {
    await ok(await call(overview, '/api/admin/overview', { auth: developer }));
  });
});

describe('secrets', () => {
  it('no response carries a hash, a ciphertext or a password hash', async () => {
    const challenge = await createChallenge(sql, 1);
    await sql`UPDATE app.challenges SET flag_mode = 'static', flag_template = NULL, static_flag_hash = 'MARKER-STATIC-HASH' WHERE id = ${challenge.id}`;
    await sql`UPDATE app.locations SET answer_hash = 'MARKER-LOC-HASH', answer_enc = 'MARKER-LOC-ENC'
      WHERE level = 'easy'`;
    await sql`UPDATE app.surprise_events SET answer_hash = 'MARKER-SUR-HASH', answer_enc = 'MARKER-SUR-ENC'
      WHERE kind = 'spidey_signal'`;
    await sql`UPDATE app.users SET password_hash = 'MARKER-PASSWORD-HASH' WHERE username = 'teama'`;
    await sql`INSERT INTO app.submissions (team_id, challenge_id, submitted_hash, is_correct, result)
      VALUES (${teamId}, ${challenge.id}, 'MARKER-SUBMITTED-HASH', false, 'wrong')`;
    await sql`INSERT INTO app.location_submissions (team_id, location_id, submitted_hash, is_correct)
      SELECT ${teamId}, id, 'MARKER-SUBMITTED-HASH', false FROM app.locations LIMIT 1`;

    const bodies = [
      await call(teams, '/api/admin/teams', { auth: superAdmin }),
      await call(teamGet, '/api/admin/teams/x', { auth: superAdmin, ctx: { id: teamId } }),
      await call(challenges, '/api/admin/challenges', { auth: superAdmin }),
      await call(challengeGet, '/api/admin/challenges/x', {
        auth: superAdmin,
        ctx: { id: challenge.id },
      }),
      await call(locations, '/api/admin/locations', { auth: superAdmin }),
      await call(surprises, '/api/admin/surprises', { auth: superAdmin }),
      await call(overview, '/api/admin/overview', { auth: superAdmin }),
      await call(monitor, '/api/admin/monitor', { auth: superAdmin }),
      await call(audit, '/api/admin/audit', { auth: superAdmin }),
      await call(event, '/api/admin/event', { auth: superAdmin }),
      await call(developers, '/api/admin/developers', { auth: superAdmin }),
      await call(exportCsv, '/api/admin/export?kind=leaderboard', { auth: superAdmin }),
      await call(exportCsv, '/api/admin/export?kind=results', { auth: superAdmin }),
    ];
    for (const res of bodies) {
      const text = await res.text();
      expect(res.status, text).toBe(200);
      expect(text).not.toMatch(/MARKER/);
      expect(text).not.toMatch(/answer_?hash|answer_?enc|static_?flag_?hash|password_?hash/i);
    }
  });
});

describe('export', () => {
  it('neutralises cells that start like a formula', async () => {
    await sql`UPDATE app.teams SET name = '=HYPERLINK("x")' WHERE id = ${teamId}`;
    const csv = await (
      await call(exportCsv, '/api/admin/export?kind=leaderboard', { auth: superAdmin })
    ).text();
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
    for (const lead of ['=', '+', '-', '@']) {
      expect(toCsv([[`${lead}1+1`]])).toBe(`'${lead}1+1\r\n`);
    }
  });

  it('rejects an unknown kind', async () => {
    const res = await call(exportCsv, '/api/admin/export?kind=passwords', { auth: superAdmin });
    expect(res.status).toBe(400);
  });
});
