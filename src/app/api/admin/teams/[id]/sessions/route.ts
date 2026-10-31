import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { parseUuid } from '@/lib/admin/http';
import { db } from '@/lib/db/client';
import { sessions } from '@/lib/db/schema';
import { json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withAdmin<{ id: string }>(async (_req, _session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const rows = await db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.teamId, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, sql`now()`)),
    )
    .orderBy(desc(sessions.lastSeenAt));
  return json({ sessions: rows });
});
