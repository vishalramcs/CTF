import { desc, gt, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema';

// Unexpired, newest first. The message is plain text: callers must never render it as HTML.
export async function listAnnouncements(limit = 5) {
  const rows = await db
    .select({ message: announcements.message, createdAt: announcements.createdAt })
    .from(announcements)
    .where(or(isNull(announcements.expiresAt), gt(announcements.expiresAt, sql`now()`)))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(limit);
  return rows.map((row) => ({ message: row.message, createdAt: row.createdAt.toISOString() }));
}
