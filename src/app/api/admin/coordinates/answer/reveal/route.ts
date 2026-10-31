import { actor, NO_STORE } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { decrypt } from '@/lib/crypto/aead';
import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// The one place the final location answer leaves the server, on an explicit action, and it is audited.
export const POST = withAdmin(async (req, session) => {
  const answer = await db.transaction(async (tx) => {
    const [row] = await tx.select({ enc: eventState.coordinateAnswerEnc }).from(eventState);
    if (!row?.enc) throw new ApiError(404, 'not_found', 'No answer is set.');
    await audit(tx, {
      ...actor(req, session),
      action: 'final_answer.reveal',
      entityType: 'event',
    });
    return decrypt(env.REVEAL_ENC_KEY, row.enc);
  });

  return json({ answer }, { headers: NO_STORE });
});
