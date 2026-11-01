import { z } from 'zod';

import { claimFragment } from '@/lib/coordinates/claim';
import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { findPublishedChallenge } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

const bodySchema = z.object({ value: z.string().max(100) });

export const POST = withTeam<{ number: string }>(async (req, session, { params }) => {
  const { value } = await parseBody(req, bodySchema);
  const challenge = await findPublishedChallenge((await params).number, session.teamId);
  if (!challenge) throw new ApiError(404, 'not_found', 'No such challenge.');
  return json(await claimFragment(session.teamId, challenge, value));
});
