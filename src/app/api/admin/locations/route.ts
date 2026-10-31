import { loadLocations } from '@/lib/admin/locations';
import { json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => json({ locations: await loadLocations() }));
