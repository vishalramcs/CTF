import { z } from 'zod';

import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { submitAnswer } from '@/lib/flashy/state';

export const runtime = 'nodejs';

const bodySchema = z.object({ optionId: z.string().min(1).max(40) });

export const POST = withTeam(async (req, session) => {
  const { optionId } = await parseBody(req, bodySchema);
  const out = await submitAnswer(session.teamId, optionId);
  if (out.result === 'none') throw new ApiError(409, 'not_active', 'There is no live event.');
  if (out.result === 'not_ready') {
    throw new ApiError(409, 'not_ready', 'Watch the video first.');
  }
  if (out.result === 'already_done') {
    throw new ApiError(409, 'already_done', 'You have already finished this event.');
  }
  if (out.result === 'bad_option')
    throw new ApiError(400, 'bad_request', 'Pick one of the options.');
  // Only the outcome: the correct option is never named, and a wrong answer says nothing more.
  return json({ result: out.result }, { headers: { 'cache-control': 'no-store' } });
});
