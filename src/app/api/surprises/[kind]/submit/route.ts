import { z } from 'zod';

import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { isSurpriseKind } from '@/lib/surprises/state';
import { submitSurprise } from '@/lib/surprises/submit';

export const runtime = 'nodejs';

const bodySchema = z.object({ answer: z.string().max(500) });

export const POST = withTeam<{ kind: string }>(async (req, session, { params }) => {
  const { kind } = await params;
  if (!isSurpriseKind(kind)) throw new ApiError(404, 'not_found', 'No such surprise.');
  const { answer } = await parseBody(req, bodySchema);
  return json(await submitSurprise(session.teamId, kind, answer));
});
