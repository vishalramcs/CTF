import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { actor, parseKind } from '@/lib/admin/http';
import { isSafeAssetUrl } from '@/lib/admin/shared';
import { audit } from '@/lib/audit';
import { encrypt } from '@/lib/crypto/aead';
import { db } from '@/lib/db/client';
import { eventState, surpriseEvents } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';
import { hashSurpriseAnswer } from '@/lib/surprises/submit';

export const runtime = 'nodejs';

const instant = z.iso.datetime({ offset: true }).nullable();
const body = z
  .object({
    title: z.string().trim().min(1).max(80),
    contentHtml: z.string().max(50_000),
    assetUrl: z
      .string()
      .trim()
      .max(500)
      .refine(isSafeAssetUrl, 'Use an https:// address or a /path.')
      .nullable(),
    availableFrom: instant,
    availableUntil: instant,
    enabled: z.boolean(),
    answer: z.string().max(200),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0);

export const PATCH = withAdmin<{ kind: string }>(async (req, session, ctx) => {
  const kind = parseKind((await ctx.params).kind);
  const input = await parseBody(req, body);
  const { answer, availableFrom, availableUntil, ...rest } = input;
  if (answer !== undefined && !answer.trim()) {
    throw new ApiError(400, 'bad_request', 'The answer can not be empty.');
  }

  const changes = {
    ...rest,
    ...(availableFrom === undefined
      ? {}
      : { availableFrom: availableFrom ? new Date(availableFrom) : null }),
    ...(availableUntil === undefined
      ? {}
      : { availableUntil: availableUntil ? new Date(availableUntil) : null }),
    ...(answer === undefined
      ? {}
      : {
          answerHash: hashSurpriseAnswer(answer),
          answerEnc: encrypt(env.REVEAL_ENC_KEY, answer.trim()),
        }),
  };

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(surpriseEvents)
      .where(eq(surpriseEvents.kind, kind))
      .for('update');
    const [event] = await tx.select({ status: eventState.status }).from(eventState);
    const from = 'availableFrom' in changes ? changes.availableFrom : row.availableFrom;
    const until = 'availableUntil' in changes ? changes.availableUntil : row.availableUntil;
    if (from && until && until <= from) {
      throw new ApiError(400, 'bad_request', 'The window must end after it starts.');
    }
    if (rest.enabled) {
      if (!(changes.answerHash ?? row.answerHash)) {
        throw new ApiError(409, 'no_answer', 'Set an answer before enabling this surprise.');
      }
      // A surprise can be discovered whatever the event status, so a closed event needs a start time.
      if (event.status === 'not_started' && !from) {
        throw new ApiError(
          409,
          'not_started',
          'The event has not started. Set an availability start time first.',
        );
      }
    }
    await tx.update(surpriseEvents).set(changes).where(eq(surpriseEvents.id, row.id));
    await audit(tx, {
      ...actor(req, session),
      action: 'surprise.update',
      entityType: 'surprise',
      entityId: row.id,
      // Field names only: content and the answer stay out of the log.
      details: { kind, fields: Object.keys(input) },
    });
  });

  return json({ ok: true });
});
