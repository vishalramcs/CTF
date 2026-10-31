import { CoordinatesPanel } from '@/components/admin/coordinates-panel';
import { PageTitle } from '@/components/admin/page-title';
import { loadCoordinateConfig } from '@/lib/admin/coordinates';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function CoordinatesPage() {
  await requireAdmin();
  return (
    <>
      <PageTitle>Coordinates</PageTitle>
      <CoordinatesPanel config={await loadCoordinateConfig()} timeZone={env.EVENT_TIMEZONE} />
    </>
  );
}
