import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { normalizeLocation } from '@/lib/coordinates/normalize';
import { actor } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { encrypt } from '@/lib/crypto/aead';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ answer: z.string().max(200) });

// The final location answer: stored as an HMAC of the normalised text, plus an encrypted copy.
export const POST = withAdmin(async (req, session) => {
  const { answer } = await parseBody(req, body);
  const normalized = normalizeLocation(answer);
  if (!normalized) {
    throw new ApiError(400, 'bad_request', 'The answer needs at least one letter or digit.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventState)
      .set({
        coordinateAnswerHash: hmacHex(env.COORD_HMAC_KEY, normalized),
        coordinateAnswerEnc: encrypt(env.REVEAL_ENC_KEY, answer.trim()),
      })
      .where(eq(eventState.id, 1));
    await audit(tx, {
      ...actor(req, session),
      action: 'final_answer.save',
      entityType: 'event',
    });
  });

  return json({ ok: true });
});
