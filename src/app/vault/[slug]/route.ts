import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { challenges } from '@/lib/db/schema';
import { ApiError, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

// TRD §9: the clue is in this response's x-spidey-* headers.
export const GET = withTeam<{ slug: string }>(async (_req, session, { params }) => {
  const [challenge] = await db
    .select({ number: challenges.number })
    .from(challenges)
    .where(eq(challenges.slug, (await params).slug));
  const view = challenge && (await getChallengeView(session.teamId, String(challenge.number)));
  if (!view || view.access !== 'open') throw new ApiError(404, 'not_found', 'Nothing here.');

  const headers = new Headers({
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'private, no-store',
  });
  for (const { name, value } of view.surfaces.headers ?? []) headers.set(name, value);
  return new Response('Nothing to see on this page. Or is there?\n', { headers });
});
