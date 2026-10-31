import { PageTitle } from '@/components/admin/page-title';
import { SolvesPanel } from '@/components/admin/solves-panel';
import { loadSolveOrder } from '@/lib/admin/coordinates';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function SolvesPage() {
  await requireAdmin();
  return (
    <>
      <PageTitle>Solves</PageTitle>
      <SolvesPanel questions={await loadSolveOrder()} timeZone={env.EVENT_TIMEZONE} />
    </>
  );
}
