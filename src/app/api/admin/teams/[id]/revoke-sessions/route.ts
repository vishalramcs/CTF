import { eq } from 'drizzle-orm';

import { actor, parseUuid } from '@/lib/admin/http';
import { revokeTeamSessions } from '@/lib/admin/teams';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { teams } from '@/lib/db/schema';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);

  const revoked = await db.transaction(async (tx) => {
    const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, id));
    if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
    const count = await revokeTeamSessions(tx, id, 'admin');
    await audit(tx, {
      ...actor(req, session),
      action: 'team.revoke_sessions',
      entityType: 'team',
      entityId: id,
      details: { revokedSessions: count },
    });
    return count;
  });

  return json({ revoked });
});
