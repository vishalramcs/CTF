import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { flagTemplate } from '@/lib/admin/challenges';
import { actor, parseUuid } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { challenges } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalizeFlag } from '@/lib/flags/normalize';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('team'), template: flagTemplate }),
  z.object({ mode: z.literal('static'), flag: z.string().max(300) }),
]);

export const POST = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const input = await parseBody(req, body);

  await db.transaction(async (tx) => {
    const [challenge] = await tx
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.id, id))
      .for('update');
    if (!challenge) throw new ApiError(404, 'not_found', 'Challenge not found.');

    let flagColumns;
    if (input.mode === 'team') {
      flagColumns = { flagMode: 'team', flagTemplate: input.template, staticFlagHash: null };
    } else {
      const normalized = normalizeFlag(input.flag, env.FLAG_PREFIX);
      if (!normalized) {
        throw new ApiError(400, 'bad_request', `The flag must look like ${env.FLAG_PREFIX}{...}.`);
      }
      flagColumns = {
        flagMode: 'static',
        flagTemplate: null,
        staticFlagHash: hmacHex(env.FLAG_HMAC_KEY, normalized),
      };
    }

    await tx
      .update(challenges)
      .set({ ...flagColumns, generatorVersion: sql`${challenges.generatorVersion} + 1` })
      .where(eq(challenges.id, id));
    await audit(tx, {
      ...actor(req, session),
      action: 'challenge.set_flag',
      entityType: 'challenge',
      entityId: id,
      details: { mode: input.mode },
    });
  });

  return json({ ok: true });
});
