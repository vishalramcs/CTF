import { desc } from 'drizzle-orm';

import { AnnouncementsPanel } from '@/components/admin/announcements-panel';
import { PageTitle } from '@/components/admin/page-title';
import { requireAdmin } from '@/lib/auth/guards';
import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema';
import { env } from '@/lib/env';

export default async function AnnouncementsPage() {
  await requireAdmin();
  const rows = await db
    .select({
      id: announcements.id,
      message: announcements.message,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .orderBy(desc(announcements.createdAt));

  return (
    <>
      <PageTitle>Announcements</PageTitle>
      <AnnouncementsPanel rows={rows} timeZone={env.EVENT_TIMEZONE} />
    </>
  );
}
