import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { actor, parseLevel } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { encrypt } from '@/lib/crypto/aead';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { locations } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalizeLocation } from '@/lib/locations/normalize';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z
  .object({
    // Sent to teams even while the location is locked: never the real place.
    name: z.string().trim().min(1).max(60).optional(),
    fragmentsRequired: z.number().int().min(1).max(10).optional(),
    answer: z.string().max(200).optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

export const PATCH = withAdmin<{ level: string }>(async (req, session, ctx) => {
  const level = parseLevel((await ctx.params).level);
  const { answer, ...rest } = await parseBody(req, body);

  const normalized = answer === undefined ? undefined : normalizeLocation(answer);
  if (answer !== undefined && !normalized) {
    throw new ApiError(400, 'bad_request', 'The answer needs at least one letter or digit.');
  }
  const changes = {
    ...rest,
    ...(answer === undefined
      ? {}
      : {
          answerHash: hmacHex(env.COORD_HMAC_KEY, normalized!),
          answerEnc: encrypt(env.REVEAL_ENC_KEY, answer.trim()),
        }),
  };

  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(locations)
      .set(changes)
      .where(eq(locations.level, level))
      .returning({ id: locations.id });
    if (!row) throw new ApiError(404, 'not_found', 'Not found.');
    await audit(tx, {
      ...actor(req, session),
      action: 'location.update',
      entityType: 'location',
      entityId: row.id,
      // Which fields, never the answer.
      details: {
        level: level,
        fields: Object.keys({ ...rest, ...(answer === undefined ? {} : { answer }) }),
      },
    });
  });

  return json({ ok: true });
});
