import { loadSurprises } from '@/lib/admin/surprises';
import { json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withAdmin(async () => json({ surprises: await loadSurprises() }));
