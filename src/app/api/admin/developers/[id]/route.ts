import { and, eq, isNull } from 'drizzle-orm';

import { actor, parseUuid } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { sessions, users } from '@/lib/db/schema';
import { ApiError, json, withSuperAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// Removal deactivates the account and ends its sessions. The row stays because the audit log,
// score adjustments and snapshots point at it.
export const DELETE = withSuperAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  if (id === session.userId) {
    throw new ApiError(400, 'bad_request', "You can't remove your own access.");
  }

  await db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ isActive: false })
      .where(and(eq(users.id, id), eq(users.adminLevel, 'developer'), eq(users.isActive, true)))
      .returning({ username: users.username });
    if (!user) throw new ApiError(404, 'not_found', 'Developer not found.');
    await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokeReason: 'admin' })
      .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
    await audit(tx, {
      ...actor(req, session),
      action: 'developer.remove',
      entityType: 'user',
      entityId: id,
      details: { username: user.username },
    });
  });

  return json({ ok: true });
});
