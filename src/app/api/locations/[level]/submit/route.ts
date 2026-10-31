import { z } from 'zod';

import { challengeDifficulty } from '@/lib/db/schema';
import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { submitLocation } from '@/lib/locations/submit';

export const runtime = 'nodejs';

const bodySchema = z.object({ answer: z.string().max(200) });
const levelSchema = z.enum(challengeDifficulty.enumValues);

export const POST = withTeam<{ level: string }>(async (req, session, { params }) => {
  const level = levelSchema.safeParse((await params).level);
  if (!level.success) throw new ApiError(404, 'not_found', 'No such location.');
  const { answer } = await parseBody(req, bodySchema);
  return json(await submitLocation({ teamId: session.teamId }, level.data, answer));
});
