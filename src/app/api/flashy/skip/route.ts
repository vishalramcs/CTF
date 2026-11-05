import { ApiError, json, withTeam } from '@/lib/http';
import { skipEvent } from '@/lib/flashy/state';

export const runtime = 'nodejs';

export const POST = withTeam(async (_req, session) => {
  const out = await skipEvent(session.teamId);
  if (out.result === 'none') throw new ApiError(409, 'not_active', 'There is no live event.');
  if (out.result === 'already_done') {
    throw new ApiError(409, 'already_done', 'You have already finished this event.');
  }
  return json({ result: 'skipped' }, { headers: { 'cache-control': 'no-store' } });
});
