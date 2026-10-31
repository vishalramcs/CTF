// Shared by the R7 admin tests. They wipe the app tables, so re-run `pnpm seed` afterwards.
import { NextRequest } from 'next/server';
import type postgres from 'postgres';
import { expect } from 'vitest';

import { SESSION_COOKIE } from '@/lib/auth/shared';
import { type Auth, sessionFor } from './challenge-helpers';

export * from './challenge-helpers';

type Handler = (req: NextRequest, ctx: { params: Promise<never> }) => Promise<Response>;

// challenge-helpers' request() only sends a body on POST; admin routes also use PATCH and DELETE.
export function call(
  handler: Handler | ((...args: never[]) => unknown),
  path: string,
  {
    method = 'GET',
    auth,
    body,
    ctx,
  }: { method?: string; auth?: Auth; body?: unknown; ctx?: Record<string, string> } = {},
): Promise<Response> {
  const mutating = method !== 'GET';
  const req = new NextRequest(`http://test${path}`, {
    method,
    headers: {
      ...(mutating ? { 'content-type': 'application/json' } : {}),
      ...(auth ? { cookie: `${SESSION_COOKIE}=${auth.cookie}`, 'x-csrf-token': auth.csrf } : {}),
    },
    body: mutating ? JSON.stringify(body ?? {}) : undefined,
  });
  return (handler as Handler)(req, { params: Promise.resolve(ctx ?? {}) as Promise<never> });
}

export async function createAdmin(
  sql: postgres.Sql,
  username: string,
  level: 'super_admin' | 'developer',
): Promise<Auth & { id: string }> {
  const [user] = await sql`INSERT INTO app.users (username, password_hash, role, admin_level)
    VALUES (${username}, 'x', 'admin', ${level}) RETURNING id`;
  return { ...(await sessionFor(sql, username)), id: user.id };
}

export async function ok(res: Response, status = 200) {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return text ? JSON.parse(text) : undefined;
}

export const auditActions = async (sql: postgres.Sql): Promise<string[]> =>
  (await sql`SELECT action FROM app.audit_log ORDER BY id`).map((r) => r.action);
