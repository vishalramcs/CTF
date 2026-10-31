import { and, eq } from 'drizzle-orm';

import { DevelopersPanel } from '@/components/admin/developers-panel';
import { PageTitle } from '@/components/admin/page-title';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export default async function DevelopersPage() {
  await requireSuperAdmin();
  const developers = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      and(eq(users.role, 'admin'), eq(users.adminLevel, 'developer'), eq(users.isActive, true)),
    )
    .orderBy(users.username);

  return (
    <>
      <PageTitle>Developers</PageTitle>
      <DevelopersPanel developers={developers} />
    </>
  );
}
