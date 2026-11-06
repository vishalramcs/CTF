import { z } from 'zod';

import { submitLocation } from '@/lib/coordinates/locations';
import { json, parseBody, withTeam } from '@/lib/http';

export const runtime = 'nodejs';

const bodySchema = z.object({
  position: z.number().int().min(1).max(3),
  answer: z.string().max(200),
});

// docs/12: name the place a reconstructed location points to.
export const POST = withTeam(async (req, session) => {
  const { position, answer } = await parseBody(req, bodySchema);
  return json(await submitLocation(session.teamId, position, answer));
});
