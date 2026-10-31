import { json, withTeam } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withTeam(async () =>
  json({ serverTime: Date.now() }, { headers: { 'cache-control': 'no-store' } }),
);
