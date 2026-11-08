import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { actor } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { normalizeFinal } from '@/lib/coordinates/normalize';
import { encrypt } from '@/lib/crypto/aead';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({
  signal: z.string().trim().max(600),
  // One accepted answer per line. Empty keeps the answers already saved.
  answers: z.string().max(400),
  points: z.number().min(0).max(1000),
});

// docs/13. The space signal a team sees at six fragments, the accepted final answers (stored as
// HMACs of the normalised text plus one encrypted copy) and what a correct answer pays.
export const POST = withAdmin(async (req, session) => {
  const { signal, answers, points } = await parseBody(req, body);
  const lines = answers
    .split(/\r?\n/)
    .map((a) => a.trim())
    .filter(Boolean);
  const hashes = [...new Set(lines.map(normalizeFinal))];
  if (hashes.includes(null)) {
    throw new ApiError(400, 'bad_request', 'Each answer needs at least one letter or digit.');
  }
  const hashed = hashes.map((n) => hmacHex(env.COORD_HMAC_KEY, n!));

  await db.transaction(async (tx) => {
    await tx
      .update(eventState)
      .set({
        finalSignal: signal || null,
        finalPoints: String(points),
        ...(hashed.length > 0 && {
          coordinateAnswerHash: hashed[0],
          coordinateAnswerAltHashes: hashed,
          coordinateAnswerEnc: encrypt(env.REVEAL_ENC_KEY, lines.join('\n')),
        }),
      })
      .where(eq(eventState.id, 1));
    await audit(tx, {
      ...actor(req, session),
      action: 'final_signal.save',
      entityType: 'event',
      details: { points, answers: hashed.length, signalSet: signal.length > 0 },
    });
  });

  return json({ ok: true });
});
