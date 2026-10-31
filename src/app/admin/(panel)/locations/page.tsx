import { LocationsPanel } from '@/components/admin/locations-panel';
import { PageTitle } from '@/components/admin/page-title';
import { loadLocations } from '@/lib/admin/locations';
import { requireAdmin } from '@/lib/auth/guards';

export default async function LocationsPage() {
  await requireAdmin();

  return (
    <>
      <PageTitle>Locations</PageTitle>
      <LocationsPanel locations={await loadLocations()} />
    </>
  );
}
