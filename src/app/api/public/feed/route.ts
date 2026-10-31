import { json } from '@/lib/http';
import { getPublicFeed } from '@/lib/realtime/public-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return json(
    { feed: await getPublicFeed() },
    { headers: { 'cache-control': 'public, s-maxage=1, stale-while-revalidate=5' } },
  );
}
