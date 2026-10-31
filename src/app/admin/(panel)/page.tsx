import { OverviewLive } from '@/components/admin/overview-live';
import { PageTitle } from '@/components/admin/page-title';
import { loadOverview } from '@/lib/admin/overview';
import { requireAdmin } from '@/lib/auth/guards';

export default async function AdminPage() {
  await requireAdmin();

  return (
    <>
      <PageTitle>Overview</PageTitle>
      <OverviewLive initial={await loadOverview()} />
    </>
  );
}
