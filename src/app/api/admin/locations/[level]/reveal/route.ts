import { eq } from 'drizzle-orm';

import { actor, NO_STORE, parseLevel } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { decrypt } from '@/lib/crypto/aead';
import { db } from '@/lib/db/client';
import { locations } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// The one place a location answer leaves the server, on an explicit action, and it is audited.
export const POST = withAdmin<{ level: string }>(async (req, session, ctx) => {
  const level = parseLevel((await ctx.params).level);

  const answer = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: locations.id, enc: locations.answerEnc })
      .from(locations)
      .where(eq(locations.level, level));
    if (!row?.enc) throw new ApiError(404, 'not_found', 'No answer is set.');
    await audit(tx, {
      ...actor(req, session),
      action: 'location.reveal_answer',
      entityType: 'location',
      entityId: row.id,
      details: { level: level },
    });
    return decrypt(env.REVEAL_ENC_KEY, row.enc);
  });

  return json({ answer }, { headers: NO_STORE });
});
