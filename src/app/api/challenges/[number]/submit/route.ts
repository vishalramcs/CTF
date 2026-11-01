import { z } from 'zod';

import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { submitFlag } from '@/lib/scoring/submit';
import { findPublishedChallenge } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

const bodySchema = z.object({ flag: z.string().max(1000) });

export const POST = withTeam<{ number: string }>(async (req, session, { params }) => {
  const { flag } = await parseBody(req, bodySchema);
  const challenge = await findPublishedChallenge((await params).number, session.teamId);
  if (!challenge) throw new ApiError(404, 'not_found', 'No such challenge.');
  return json(await submitFlag({ teamId: session.teamId, sessionId: session.id }, challenge, flag));
});
