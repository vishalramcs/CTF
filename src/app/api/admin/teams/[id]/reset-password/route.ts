import { eq, sql } from 'drizzle-orm';

import { actor, NO_STORE, parseUuid } from '@/lib/admin/http';
import { revokeTeamSessions } from '@/lib/admin/teams';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import { db } from '@/lib/db/client';
import { teams, users } from '@/lib/db/schema';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// docs/07 §2: reset restores the derived password, it does not invent a new one.
export const POST = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, id));
  if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
  const password = teamPassword(team.name);
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
      details: { revokedSessions },
    });
    return user.username;
  });

  // Shown once: the plaintext exists only in this response.
  return json({ username, password }, { headers: NO_STORE });
});
