// M2 acceptance: calls the real route handlers against the dev database. Wipes the app tables,
// so re-run `pnpm seed` afterwards.
import { NextRequest } from 'next/server';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as adminLogin } from '@/app/api/auth/admin-login/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as session } from '@/app/api/auth/session/route';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE } from '@/lib/auth/shared';
import { csrfToken } from '@/lib/auth/csrf';
import { hashSessionToken, randomToken } from '@/lib/crypto/tokens';
import { db } from '@/lib/db/client';
import { isWipeable, wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { json, withAdmin, withTeam } from '@/lib/http';

const PASSWORD = 'correct-horse-battery';
const ctx = { params: Promise.resolve({}) };
let sql: postgres.Sql;
let passwordHash: string;

beforeAll(async () => {
  if (!isWipeable(env.DATABASE_URL, process.env.WIPEABLE_DB_REF)) {
    throw new Error('Refusing to wipe this database: set WIPEABLE_DB_REF to the dev project ref');
  }
  sql = postgres(env.DATABASE_URL, { prepare: false, max: 5, onnotice: () => {} });
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => wipeAppTables(sql));

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

function request(
  path: string,
  { method = 'POST', cookie, csrf, body, headers = {} }: RequestOptions = {},
): NextRequest {
  return new NextRequest(`http://test${path}`, {
    method,
    headers: {
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...headers,
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
}

type RequestOptions = {
  method?: string;
  cookie?: string;
  csrf?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function createTeam(username = 'team1'): Promise<string> {
  const [team] = await sql`
    WITH team AS (
      INSERT INTO app.teams (name, slug) VALUES (${`Team ${username}`}, ${username}) RETURNING id
    ), login AS (
      INSERT INTO app.users (username, password_hash, role, team_id)
      SELECT ${username}, ${passwordHash}, 'team', id FROM team
    )
    SELECT id FROM team`;
  return team.id;
}

async function createAdmin(username = 'admin1'): Promise<void> {
  await sql`
    INSERT INTO app.users (username, password_hash, role)
    VALUES (${username}, ${passwordHash}, 'admin')`;
}

function tokenFrom(res: Response): string {
  return res.headers.get('set-cookie')!.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1];
}

function tryLogin(username: string, password = PASSWORD, headers = {}) {
  return login(request('/api/auth/login', { body: { username, password }, headers }), ctx);
}

async function logIn(
  username = 'team1',
  route: typeof login = login,
): Promise<{ cookie: string; csrf: string }> {
  const res = await route(
    request('/api/auth/login', { body: { username, password: PASSWORD } }),
    ctx,
  );
  expect(res.status).toBe(200);
  return { cookie: tokenFrom(res), csrf: (await res.json()).csrf };
}

// For tests that aren't about login: a real login costs about 12 database round trips.
async function sessionFor(username = 'team1'): Promise<{ cookie: string; csrf: string }> {
  const cookie = randomToken();
  const [row] = await sql`
    INSERT INTO app.sessions (user_id, role, team_id, token_hash, expires_at)
    SELECT id, role, team_id, ${hashSessionToken(cookie, env.SESSION_PEPPER)}, now() + interval '1 hour'
    FROM app.users WHERE username = ${username}
    RETURNING id`;
  return { cookie, csrf: csrfToken(row.id) };
}

function sessionStatus(cookie: string) {
  return session(request('/api/auth/session', { method: 'GET', cookie }), ctx);
}

describe('login', () => {
  it('sets a hardened cookie, returns the team and csrf, and stores only the token hash', async () => {
    await createTeam();
    const res = await tryLogin('TEAM1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.team).toEqual({ name: 'Team team1' });
    expect(body.csrf).toMatch(/^[0-9a-f]{64}$/);

    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//i);

    const token = tokenFrom(res);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const rows = await sql`SELECT token_hash FROM app.sessions`;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashSessionToken(token, env.SESSION_PEPPER));
    expect(rows[0].token_hash).not.toContain(token);
  });

  it('gives team sessions 8 hours and admin sessions 12', async () => {
    await createTeam();
    await createAdmin();
    await logIn('team1');
    await logIn('admin1', adminLogin);
    const rows = await sql`
      SELECT role, extract(epoch from expires_at - created_at)::int / 3600 AS hours
      FROM app.sessions ORDER BY role`;
    expect(Object.fromEntries(rows.map((r) => [r.role, r.hours]))).toEqual({ admin: 12, team: 8 });
  });

  it('answers a wrong password and an unknown username identically, and counts both', async () => {
    await createTeam();
    const wrong = await tryLogin('team1', 'nope');
    const unknown = await tryLogin('ghost', 'nope');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    const [{ count }] = await sql`SELECT count(*)::int FROM app.login_attempts WHERE NOT success`;
    expect(count).toBe(2);
    expect(await sql`SELECT 1 FROM app.sessions`).toHaveLength(0);
  });

  it('records a successful attempt', async () => {
    await createTeam();
    await logIn();
    const [row] = await sql`SELECT success FROM app.login_attempts`;
    expect(row.success).toBe(true);
  });

  it('refuses a disabled team with the documented message', async () => {
    const teamId = await createTeam();
    await sql`UPDATE app.teams SET is_active = false WHERE id = ${teamId}`;
    const res = await tryLogin('team1');
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe('This team is disabled. Ask an organiser.');
    expect(await sql`SELECT 1 FROM app.sessions`).toHaveLength(0);
  });

  it('keeps the two login forms apart', async () => {
    await createTeam();
    await createAdmin();
    expect((await tryLogin('admin1')).status).toBe(401);
    const res = await adminLogin(
      request('/api/auth/admin-login', { body: { username: 'team1', password: PASSWORD } }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body and a non-JSON content type', async () => {
    expect((await login(request('/api/auth/login', { body: { username: 'a' } }), ctx)).status).toBe(
      400,
    );
    const form = new NextRequest('http://test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=a&password=b',
    });
    expect((await login(form, ctx)).status).toBe(415);
  });

  it('survives an unparseable forwarded IP', async () => {
    await createTeam();
    const res = await tryLogin('team1', PASSWORD, { 'x-forwarded-for': 'not-an-ip' });
    expect(res.status).toBe(200);
  });
});

describe('session cap', () => {
  it('a 3rd login evicts the oldest, and the evicted session gets 401 evicted', async () => {
    await createTeam();
    const first = await logIn();
    const second = await logIn();
    expect((await sessionStatus(first.cookie)).status).toBe(200);

    const third = await logIn();

    const evicted = await sessionStatus(first.cookie);
    expect(evicted.status).toBe(401);
    const body = await evicted.json();
    expect(body.reason).toBe('evicted');
    expect(body.error.code).toBe('evicted');
    expect((await sessionStatus(second.cookie)).status).toBe(200);
    expect((await sessionStatus(third.cookie)).status).toBe(200);

    const audits = await sql`SELECT action FROM app.audit_log`;
    expect(audits.map((a) => a.action)).toEqual(['session.evicted']);
  });

  it('holds under parallel logins from separate server instances', async () => {
    const teamId = await createTeam();
    // Each fresh module graph gets its own connection, like separate serverless instances.
    const instances = await Promise.all(
      Array.from({ length: 6 }, async () => {
        vi.resetModules();
        return {
          route: await import('@/app/api/auth/login/route'),
          client: await import('@/lib/db/client'),
        };
      }),
    );
    try {
      const results = await Promise.all(
        instances.map(({ route }) =>
          route.POST(
            request('/api/auth/login', { body: { username: 'team1', password: PASSWORD } }),
            ctx,
          ),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    } finally {
      await Promise.all(instances.map(({ client }) => client.db.$client.end()));
    }
    const rows = await sql`
      SELECT count(*) FILTER (WHERE revoked_at IS NULL)::int AS active,
             count(*) FILTER (WHERE revoke_reason = 'evicted')::int AS evicted
      FROM app.sessions WHERE team_id = ${teamId}`;
    expect(rows[0]).toEqual({ active: 2, evicted: 4 });
  });

  it('ignores expired sessions when counting', async () => {
    const teamId = await createTeam();
    const first = await logIn();
    const second = await logIn();
    await sql`UPDATE app.sessions SET expires_at = now() - interval '1 minute'
              WHERE team_id = ${teamId}`;
    const third = await logIn();
    expect((await sql`SELECT 1 FROM app.sessions WHERE revoked_at IS NOT NULL`).length).toBe(0);
    expect((await sessionStatus(third.cookie)).status).toBe(200);
    expect((await (await sessionStatus(first.cookie)).json()).reason).toBe('expired');
    expect((await (await sessionStatus(second.cookie)).json()).reason).toBe('expired');
  });

  it('does not cap admin sessions', async () => {
    await createAdmin();
    for (let i = 0; i < 3; i++) await logIn('admin1', adminLogin);
    const rows = await sql`SELECT 1 FROM app.sessions WHERE revoked_at IS NULL`;
    expect(rows).toHaveLength(3);
  });
});

describe('role guards', () => {
  const teamRoute = withTeam(async (_req, s) => json({ teamId: s.teamId }));
  const adminRoute = withAdmin(async (_req, s) => json({ userId: s.userId }));

  it('lets each role use only its own routes', async () => {
    const teamId = await createTeam();
    await createAdmin();
    const team = await sessionFor('team1');
    const admin = await sessionFor('admin1');

    const ok = await teamRoute(request('/x', { cookie: team.cookie, csrf: team.csrf }), ctx);
    expect(await ok.json()).toEqual({ teamId });
    expect(
      (await adminRoute(request('/x', { cookie: admin.cookie, csrf: admin.csrf }), ctx)).status,
    ).toBe(200);

    const teamOnAdmin = await adminRoute(
      request('/x', { cookie: team.cookie, csrf: team.csrf }),
      ctx,
    );
    expect(teamOnAdmin.status).toBe(403);
    const adminOnTeam = await teamRoute(
      request('/x', { cookie: admin.cookie, csrf: admin.csrf }),
      ctx,
    );
    expect(adminOnTeam.status).toBe(403);
  });

  it('gives no session a 401 with no reason, so the client shows no modal', async () => {
    const res = await teamRoute(request('/x'), ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.reason).toBeUndefined();
    expect(body.error.code).toBe('unauthenticated');
    expect((await teamRoute(request('/x', { cookie: 'made-up' }), ctx)).status).toBe(401);
  });

  it('requires a valid csrf token on mutations but not on reads', async () => {
    await createTeam();
    await createTeam('team2');
    const team = await sessionFor('team1');
    const teammate = await sessionFor('team2');

    const noToken = await teamRoute(request('/x', { cookie: team.cookie }), ctx);
    expect(noToken.status).toBe(403);
    expect((await noToken.json()).error.code).toBe('csrf');
    const wrongToken = await teamRoute(
      request('/x', { cookie: team.cookie, csrf: teammate.csrf }),
      ctx,
    );
    expect(wrongToken.status).toBe(403);
    const read = await teamRoute(request('/x', { method: 'GET', cookie: team.cookie }), ctx);
    expect(read.status).toBe(200);
  });

  it('ends a live session once its team is disabled', async () => {
    const teamId = await createTeam();
    const { cookie } = await sessionFor();
    await sql`UPDATE app.teams SET is_active = false WHERE id = ${teamId}`;
    expect((await (await sessionStatus(cookie)).json()).reason).toBe('team_disabled');
  });

  it('hides internals on an unexpected error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = withTeam(async () => {
      throw new Error('boom', { cause: new Error('inner detail') });
    });
    await createTeam();
    const team = await sessionFor();
    const res = await boom(request('/x', { cookie: team.cookie, csrf: team.csrf }), ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe('Signal interference, try again');
    expect(JSON.stringify(body)).not.toContain('inner detail');
    expect(spy.mock.calls[0][0]).toContain('inner detail');
    expect(spy.mock.calls[0][0]).not.toContain('boom');
    spy.mockRestore();
  });
});

describe('last_seen_at', () => {
  const setAge = (age: string) =>
    sql`UPDATE app.sessions SET last_seen_at = now() - ${age}::interval`;

  it('is written at most once per 60 s', async () => {
    await createTeam();
    const { cookie } = await sessionFor();

    await setAge('30 seconds');
    await sessionStatus(cookie);
    const [recent] = await sql`
      SELECT extract(epoch from now() - last_seen_at) AS age FROM app.sessions`;
    expect(Number(recent.age)).toBeGreaterThan(25);

    await setAge('2 minutes');
    await sessionStatus(cookie);
    const [stale] = await sql`
      SELECT extract(epoch from now() - last_seen_at) AS age FROM app.sessions`;
    expect(Number(stale.age)).toBeLessThan(25);
  });
});

describe('login rate limit', () => {
  it('blocks the 11th attempt after 10 failures, even with the right password', async () => {
    await createTeam();
    for (let i = 0; i < 10; i++) {
      expect((await tryLogin('team1', 'wrong')).status).toBe(401);
    }
    const blocked = await tryLogin('TEAM1');
    expect(blocked.status).toBe(429);
    const { error } = await blocked.json();
    expect(error.code).toBe('rate_limited');
    expect(error.retryAfter).toBeGreaterThan(590);
    expect(error.retryAfter).toBeLessThanOrEqual(600);
    expect(error.message).toBe('Too many attempts. Try again in 10 min.');
  });

  it('does not extend the lockout by counting blocked attempts', async () => {
    await createTeam();
    await sql`
      INSERT INTO app.login_attempts (username, success)
      SELECT 'team1', false FROM generate_series(1, 10)`;
    await tryLogin('team1');
    const [{ count }] = await sql`SELECT count(*)::int FROM app.login_attempts`;
    expect(count).toBe(10);
  });

  it('forgets failures older than 10 minutes', async () => {
    await createTeam();
    await sql`
      INSERT INTO app.login_attempts (username, success, created_at)
      SELECT 'team1', false, now() - interval '11 minutes' FROM generate_series(1, 10)`;
    expect((await tryLogin('team1')).status).toBe(200);
  });

  it('keeps one username from locking out another', async () => {
    await createTeam('team1');
    await createTeam('team2');
    await sql`
      INSERT INTO app.login_attempts (username, success)
      SELECT 'team1', false FROM generate_series(1, 10)`;
    expect((await tryLogin('team1')).status).toBe(429);
    expect((await tryLogin('team2')).status).toBe(200);
  });

  it('blocks an IP after 30 failures across usernames, without touching other IPs', async () => {
    await createTeam();
    await sql`
      INSERT INTO app.login_attempts (username, ip, success)
      SELECT 'guess' || n, '203.0.113.9', false FROM generate_series(1, 30) n`;
    const sameIp = await tryLogin('team1', PASSWORD, { 'x-forwarded-for': '203.0.113.9' });
    expect(sameIp.status).toBe(429);
    const otherIp = await tryLogin('team1', PASSWORD, { 'x-forwarded-for': '203.0.113.10' });
    expect(otherIp.status).toBe(200);
  });
});

describe('logout', () => {
  it('revokes the session and clears the cookie', async () => {
    await createTeam();
    const { cookie, csrf } = await sessionFor();
    const res = await logout(request('/api/auth/logout', { cookie, csrf }), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
    expect((await (await sessionStatus(cookie)).json()).reason).toBe('logout');
  });

  it('leaves the session alive without a valid csrf token', async () => {
    await createTeam();
    const { cookie } = await sessionFor();
    const res = await logout(request('/api/auth/logout', { cookie }), ctx);
    expect(res.status).toBe(403);
    expect((await sessionStatus(cookie)).status).toBe(200);
  });

  it('still clears the cookie of a dead session', async () => {
    const res = await logout(request('/api/auth/logout', { cookie: 'dead' }), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
  });

  it('writes admin login and logout to the audit log, without secrets', async () => {
    await createAdmin();
    const { cookie, csrf } = await logIn('admin1', adminLogin);
    await logout(request('/api/auth/logout', { cookie, csrf }), ctx);
    const rows = await sql`SELECT action, details FROM app.audit_log ORDER BY id`;
    expect(rows.map((r) => r.action)).toEqual(['admin.login', 'admin.logout']);
    expect(JSON.stringify(rows)).not.toContain(cookie);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });
});
