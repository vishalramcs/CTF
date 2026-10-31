import { json } from '@/lib/http';
import { getPublicState } from '@/lib/realtime/public-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TRD §6.5: no session, so the CDN can absorb the refetch burst after a ping.
export async function GET() {
  return json(await getPublicState(), {
    headers: { 'cache-control': 'public, s-maxage=1, stale-while-revalidate=5' },
  });
}
