import { eq } from 'drizzle-orm';

import { actor, NO_STORE, parseKind } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { decrypt } from '@/lib/crypto/aead';
import { db } from '@/lib/db/client';
import { surpriseEvents } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// The one place a surprise answer leaves the server, on an explicit action, and it is audited.
export const POST = withAdmin<{ kind: string }>(async (req, session, ctx) => {
  const kind = parseKind((await ctx.params).kind);

  const answer = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: surpriseEvents.id, enc: surpriseEvents.answerEnc })
      .from(surpriseEvents)
      .where(eq(surpriseEvents.kind, kind));
    if (!row?.enc) throw new ApiError(404, 'not_found', 'No answer is set.');
    await audit(tx, {
      ...actor(req, session),
      action: 'surprise.reveal_answer',
      entityType: 'surprise',
      entityId: row.id,
      details: { kind },
    });
    return decrypt(env.REVEAL_ENC_KEY, row.enc);
  });

  return json({ answer }, { headers: NO_STORE });
});
