import { eq } from 'drizzle-orm';

import { actor, parseUuid } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const DELETE = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  await db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });
    if (!gone) throw new ApiError(404, 'not_found', 'Announcement not found.');
    await audit(tx, {
      ...actor(req, session),
      action: 'announcement.delete',
      entityType: 'announcement',
      entityId: id,
    });
  });
  return json({ ok: true });
});
