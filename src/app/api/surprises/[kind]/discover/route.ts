import { ApiError, json, withTeam } from '@/lib/http';
import { isSurpriseKind } from '@/lib/surprises/state';
import { discoverSurprise } from '@/lib/surprises/submit';

export const runtime = 'nodejs';

export const POST = withTeam<{ kind: string }>(async (_req, session, { params }) => {
  const { kind } = await params;
  if (!isSurpriseKind(kind)) throw new ApiError(404, 'not_found', 'No such surprise.');
  return json(await discoverSurprise(session.teamId, kind));
});
