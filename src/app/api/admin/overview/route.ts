import { NO_STORE } from '@/lib/admin/http';
import { loadOverview } from '@/lib/admin/overview';
import { json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => json(await loadOverview(), { headers: NO_STORE }));
