import { z } from 'zod';

import { submitCoordinates } from '@/lib/coordinates/submit';
import { json, parseBody, withTeam } from '@/lib/http';

export const runtime = 'nodejs';

const bodySchema = z.object({ answer: z.string().max(200) });

export const POST = withTeam(async (req, session) => {
  const { answer } = await parseBody(req, bodySchema);
  return json(await submitCoordinates(session.teamId, answer));
});
