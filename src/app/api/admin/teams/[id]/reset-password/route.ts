import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { actor, NO_STORE, parseUuid } from '@/lib/admin/http';
import { revokeTeamSessions } from '@/lib/admin/teams';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import { db } from '@/lib/db/client';
import { teams, users } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// No body, or no password: back to the default (the team name lowercased, no spaces, reversed).
// A password in the body (4-64 characters) is set instead.
const body = z.object({ password: z.string().trim().min(4).max(64).optional() }).optional();

export const POST = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const chosen = (await parseBody(req, body))?.password;
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, id));
  if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
  const password = chosen ?? teamPassword(team.name);
  const passwordHash = await hashPassword(password);

  const username = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: sql`now()` })
      .where(eq(users.teamId, id))
      .returning({ username: users.username });
    if (!user) throw new ApiError(404, 'not_found', 'Team not found.');
    const revokedSessions = await revokeTeamSessions(tx, id, 'password_reset');
    await audit(tx, {
      ...actor(req, session),
      action: 'team.reset_password',
      entityType: 'team',
      entityId: id,
      details: { revokedSessions, mode: chosen ? 'custom' : 'default' },
    });
    return user.username;
  });

  // Shown once: the plaintext exists only in this response.
  return json({ username, password }, { headers: NO_STORE });
});
