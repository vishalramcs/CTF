import { ApiError, json, withTeam } from '@/lib/http';
import { authorizePlayback } from '@/lib/flashy/state';

export const runtime = 'nodejs';

export const POST = withTeam(async (_req, session) => {
  const out = await authorizePlayback(session.teamId);
  if (out.result === 'none') throw new ApiError(409, 'not_active', 'There is no live event.');
  if (out.result === 'limit') {
    throw new ApiError(403, 'playback_limit', 'No plays left for this event.');
  }
  if (out.result === 'finished') {
    throw new ApiError(409, 'already_done', 'You have already finished this event.');
  }
  return json(out, { headers: { 'cache-control': 'no-store' } });
});
