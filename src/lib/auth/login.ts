import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { csrfToken } from '@/lib/auth/csrf';
import { verifyAgainstNothing, verifyPassword } from '@/lib/auth/password';
import { openSession, SESSION_COOKIE, SESSION_HOURS } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { loginAttempts, teams, users } from '@/lib/db/schema';
import { ApiError, clientIp, json, parseBody, withPublic } from '@/lib/http';
import { loginRetryAfter } from '@/lib/ratelimit';

const credentials = z.object({
  username: z.string().trim().min(1).max(64),
  // Bounded so a huge body can't be fed to the hash.
  password: z.string().min(1).max(256),
});

export function loginRoute(role: 'team' | 'admin') {
  return withPublic(async (req) => {
    const { username, password } = await parseBody(req, credentials);
    const ip = clientIp(req);

    const retryAfter = await loginRetryAfter(username, ip);
    if (retryAfter > 0) {
      const minutes = Math.ceil(retryAfter / 60);
      throw new ApiError(
        429,
        'rate_limited',
        `Too many attempts. Try again in ${minutes} min.`,
        retryAfter,
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        teamId: users.teamId,
        teamName: teams.name,
        active: sql<boolean>`${users.isActive} AND coalesce(${teams.isActive}, true)`,
      })
      .from(users)
      .leftJoin(teams, eq(teams.id, users.teamId))
      .where(and(sql`lower(${users.username}) = lower(${username})`, eq(users.role, role)));

    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyAgainstNothing(password);

    await db.insert(loginAttempts).values({ username, ip, success: valid && user.active });

    if (!valid) {
      throw new ApiError(
        401,
        'invalid_credentials',
        "Those credentials don't match. Check the slip your organiser gave you.",
      );
    }
    if (!user.active) {
      throw new ApiError(403, 'team_disabled', 'This team is disabled. Ask an organiser.');
    }

    const session = await openSession({
      id: user.id,
      role,
      teamId: user.teamId,
      ip,
      userAgent: req.headers.get('user-agent')?.slice(0, 256) ?? null,
    });

    if (role === 'admin') {
      await audit(db, {
        actorId: user.id,
        action: 'admin.login',
        entityType: 'session',
        entityId: session.id,
        ip,
      });
    }

    const csrf = csrfToken(session.id);
    const res = json(role === 'team' ? { team: { name: user.teamName }, csrf } : { csrf });
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      // Safari refuses Secure cookies on http://localhost.
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_HOURS[role] * 3600,
    });
    return res;
  });
}
