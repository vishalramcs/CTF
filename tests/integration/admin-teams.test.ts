// R7: team management through the real admin routes.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as login } from '@/app/api/auth/login/route';
import { PATCH as teamPatch } from '@/app/api/admin/teams/[id]/route';
import { POST as resetPassword } from '@/app/api/admin/teams/[id]/reset-password/route';
import { POST as revoke } from '@/app/api/admin/teams/[id]/revoke-sessions/route';
import { GET as sessionsGet } from '@/app/api/admin/teams/[id]/sessions/route';
import { GET as teamGet } from '@/app/api/admin/teams/[id]/route';
import { GET as teamsGet, POST as teamsPost } from '@/app/api/admin/teams/route';
import { teamPassword } from '@/lib/auth/team-credentials';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import {
  auditActions,
  call,
  createAdmin,
  createChallenge,
  ok,
  openSql,
  type Auth,
} from './admin-helpers';

const NAMES = ['Web Slingers', 'Night Owls', 'Spider Gang'];

let sql: postgres.Sql;
let admin: Auth;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  admin = await createAdmin(sql, 'root1', 'super_admin');
  await createChallenge(sql, 1);
  await createChallenge(sql, 2);
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

async function createTeams(names = NAMES) {
  const body = await ok(
    await call(teamsPost, '/api/admin/teams', {
      method: 'POST',
      auth: admin,
      body: { text: names.join('\n') },
    }),
    201,
  );
  return body.credentials as { team: string; username: string; password: string }[];
}

async function logIn(username: string, password: string) {
  return call(login, '/api/auth/login', { method: 'POST', body: { username, password } });
}

describe('creating teams', () => {
  it('creates 3 teams that can log in with their code and reversed-name password', async () => {
    const credentials = await createTeams();
    expect(credentials.map((c) => c.team)).toEqual(NAMES);
    expect(credentials.map((c) => c.password)).toEqual(['sregnilsbew', 'slwothgin', 'gnagredips']);

    for (const c of credentials) {
      expect(c.username).toMatch(/^sp-/);
      expect(c.password).toBe(teamPassword(c.team));
      const res = await logIn(c.username, c.password);
      expect((await ok(res)).team.name).toBe(c.team);
    }
    expect((await logIn(credentials[0].username, 'wrong-password')).status).toBe(401);

    // Only the Argon2 hash is stored, and variants exist for every new team.
    const stored = await sql`SELECT password_hash FROM app.users WHERE role = 'team'`;
    expect(stored).toHaveLength(3);
    for (const row of stored) expect(row.password_hash).toMatch(/^\$argon2id\$/);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.team_challenge_variants`;
    expect(n).toBe(3 * 2);
    expect(await auditActions(sql)).toContain('team.create');
  });

  it('refuses duplicates and bad names, and the audit row holds no password', async () => {
    await createTeams(['Web Slingers']);
    const again = await call(teamsPost, '/api/admin/teams', {
      method: 'POST',
      auth: admin,
      body: { text: 'web slingers' },
    });
    expect(again.status).toBe(409);
    for (const text of ['', 'a', 'Twin\nTwin']) {
      const res = await call(teamsPost, '/api/admin/teams', {
        method: 'POST',
        auth: admin,
        body: { text },
      });
      expect(res.status, text).toBe(400);
    }
    const rows =
      await sql`SELECT details::text AS d FROM app.audit_log WHERE action = 'team.create'`;
    expect(rows.map((r) => r.d).join()).not.toContain('sregnilsbew');
  });
});

describe('managing a team', () => {
  it('resets the password, revokes sessions, renames, hides and deactivates, each audited', async () => {
    const [{ team: name, username, password }] = await createTeams(['Web Slingers']);
    const [row] = await sql`SELECT team_id FROM app.users WHERE username = ${username}`;
    const id: string = row.team_id;
    const ctx = { id };

    // A live session, then a changed password: the reset must restore the derived one and log out.
    expect((await logIn(username, password)).status).toBe(200);
    await sql`UPDATE app.users SET password_hash = 'x' WHERE username = ${username}`;
    expect((await logIn(username, password)).status).toBe(401);
    const body = await ok(
      await call(resetPassword, '/api/admin/teams/x/reset-password', {
        method: 'POST',
        auth: admin,
        ctx,
      }),
    );
    expect(body).toEqual({ username, password: teamPassword(name) });
    const reasons = await sql`SELECT revoke_reason FROM app.sessions WHERE team_id = ${id}`;
    expect(reasons.map((r) => r.revoke_reason)).toEqual(['password_reset']);
    expect((await ok(await logIn(username, password))).team.name).toBe(name);

    const listed = await ok(
      await call(sessionsGet, '/api/admin/teams/x/sessions', { auth: admin, ctx }),
    );
    expect(listed.sessions).toHaveLength(1);

    expect(
      (await ok(await call(revoke, '/api/admin/x', { method: 'POST', auth: admin, ctx }))).revoked,
    ).toBe(1);
    const ended = await sql`SELECT revoke_reason FROM app.sessions WHERE team_id = ${id}`;
    expect(ended.map((r) => r.revoke_reason).sort()).toEqual(['admin', 'password_reset']);

    await ok(
      await call(teamPatch, '/api/admin/x', {
        method: 'PATCH',
        auth: admin,
        ctx,
        body: { name: 'Web Slingers 2', isHidden: true },
      }),
    );
    await logIn(username, teamPassword(name));
    await ok(
      await call(teamPatch, '/api/admin/x', {
        method: 'PATCH',
        auth: admin,
        ctx,
        body: { isActive: false },
      }),
    );
    expect(
      (
        await sql`SELECT revoke_reason FROM app.sessions WHERE team_id = ${id} AND revoke_reason = 'team_disabled'`
      ).length,
    ).toBe(1);
    expect((await logIn(username, teamPassword(name))).status).toBe(403);

    const actions = await auditActions(sql);
    expect(actions).toEqual(
      expect.arrayContaining(['team.reset_password', 'team.revoke_sessions', 'team.update']),
    );

    const detail = await ok(await call(teamGet, '/api/admin/x', { auth: admin, ctx }));
    expect(detail.team).toMatchObject({ name: 'Web Slingers 2', isHidden: true, isActive: false });
    expect(detail.score.total).toBe('0.0');
  });

  it('the team list marks hidden teams, and an unknown team is a 404', async () => {
    await createTeams(['Web Slingers']);
    const { teams } = await ok(await call(teamsGet, '/api/admin/teams', { auth: admin }));
    expect(teams).toHaveLength(1);
    const res = await call(teamPatch, '/api/admin/x', {
      method: 'PATCH',
      auth: admin,
      ctx: { id: '00000000-0000-4000-8000-000000000000' },
      body: { isHidden: true },
    });
    expect(res.status).toBe(404);
  });
});
