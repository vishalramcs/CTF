import { desc } from 'drizzle-orm';
import { z } from 'zod';

import { actor } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema';
import { json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ message: z.string().trim().min(1).max(500) });

export const GET = withAdmin(async () =>
  json({
    announcements: await db.select().from(announcements).orderBy(desc(announcements.createdAt)),
  }),
);

export const POST = withAdmin(async (req, session) => {
  const { message } = await parseBody(req, body);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({ message, createdBy: session.userId })
      .returning({ id: announcements.id });
    await audit(tx, {
      ...actor(req, session),
      action: 'announcement.create',
      entityType: 'announcement',
      entityId: row.id,
    });
    return row.id;
  });
  return json({ id }, { status: 201 });
});
