import { loadEventState } from '@/lib/admin/event';
import { json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => json({ event: await loadEventState() }));
