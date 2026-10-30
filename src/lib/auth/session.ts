import { and, eq, isNull, sql } from 'drizzle-orm';

import { audit } from '@/lib/audit';
import type { SessionEndReason } from '@/lib/auth/shared';
import { hashSessionToken, randomToken } from '@/lib/crypto/tokens';
import { db } from '@/lib/db/client';
import { sessions, teams, users } from '@/lib/db/schema';
import { env } from '@/lib/env';

export { SESSION_COOKIE } from '@/lib/auth/shared';
export const SESSION_HOURS = { team: 8, admin: 12 } as const;

type SessionBase = { id: string; userId: string };
export type TeamSession = SessionBase & { role: 'team'; teamId: string; teamName: string };
export type AdminSession = SessionBase & { role: 'admin'; teamId: null; teamName: null };
export type Session = TeamSession | AdminSession;

export type SessionLookup =
  { ok: true; session: Session } | { ok: false; reason: SessionEndReason | 'none' };

function hashToken(token: string): string {
  return hashSessionToken(token, env.SESSION_PEPPER);
}

export async function lookupSession(token: string | undefined): Promise<SessionLookup> {
  if (!token) return { ok: false, reason: 'none' };

  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      role: sessions.role,
      teamId: sessions.teamId,
      teamName: teams.name,
      revokedAt: sessions.revokedAt,
      revokeReason: sessions.revokeReason,
      accountActive: sql<boolean>`${users.isActive} AND coalesce(${teams.isActive}, true)`,
      expired: sql<boolean>`${sessions.expiresAt} <= now()`,
      stale: sql<boolean>`${sessions.lastSeenAt} < now() - interval '60 seconds'`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(teams, eq(teams.id, sessions.teamId))
    .where(eq(sessions.tokenHash, hashToken(token)));

  if (!row) return { ok: false, reason: 'none' };
  if (row.revokedAt)
    return { ok: false, reason: (row.revokeReason as SessionEndReason) ?? 'admin' };
  if (row.expired) return { ok: false, reason: 'expired' };
  if (!row.accountActive) return { ok: false, reason: 'team_disabled' };

  if (row.stale) {
    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(sessions.id, row.id));
  }

  const { id, userId, role, teamId, teamName } = row;
  return { ok: true, session: { id, userId, role, teamId, teamName } as Session };
}

// 05 §5 Login recipe. The advisory lock makes the count and the eviction atomic per team.
export async function openSession(user: {
  id: string;
  role: 'team' | 'admin';
  teamId: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ id: string; token: string }> {
  const token = randomToken();

  const id = await db.transaction(async (tx) => {
    if (user.teamId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`login:${user.teamId}`}))`);
      const active = sql`team_id = ${user.teamId} AND revoked_at IS NULL AND expires_at > now()`;
      const [{ count }] = await tx.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM app.sessions WHERE ${active}`,
      );
      const excess = count - env.MAX_SESSIONS_PER_TEAM + 1;
      if (excess > 0) {
        const evicted = await tx.execute<{ id: string }>(sql`
          UPDATE app.sessions SET revoked_at = now(), revoke_reason = 'evicted'
          WHERE id IN (
            SELECT id FROM app.sessions WHERE ${active} ORDER BY created_at, id LIMIT ${excess}
          )
          RETURNING id`);
        for (const session of evicted) {
          await audit(tx, {
            actorId: user.id,
            action: 'session.evicted',
            entityType: 'session',
            entityId: session.id,
            ip: user.ip,
          });
        }
      }
    }

    const [session] = await tx
      .insert(sessions)
      .values({
        userId: user.id,
        role: user.role,
        teamId: user.teamId,
        tokenHash: hashToken(token),
        ip: user.ip,
        userAgent: user.userAgent,
        expiresAt: sql`now() + make_interval(hours => ${SESSION_HOURS[user.role]})`,
      })
      .returning({ id: sessions.id });
    return session.id;
  });

  return { id, token };
}

export async function revokeSession(id: string, reason: SessionEndReason): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: sql`now()`, revokeReason: reason })
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
}
