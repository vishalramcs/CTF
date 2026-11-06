import { json, withTeam } from '@/lib/http';
import { getTeamState } from '@/lib/flashy/state';

export const runtime = 'nodejs';

// The team comes from the session, never from the request.
export const GET = withTeam(async (_req, session) =>
  json(await getTeamState(session.teamId), { headers: { 'cache-control': 'no-store' } }),
);
