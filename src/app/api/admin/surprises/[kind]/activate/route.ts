import { eq, sql } from 'drizzle-orm';

import { actor, parseKind } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { surpriseEvents } from '@/lib/db/schema';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// Enables the surprise and opens its window now (an old end time is cleared).
export const POST = withAdmin<{ kind: string }>(async (req, session, ctx) => {
  const kind = parseKind((await ctx.params).kind);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: surpriseEvents.id, hasAnswer: surpriseEvents.answerHash })
      .from(surpriseEvents)
      .where(eq(surpriseEvents.kind, kind))
      .for('update');
    if (!row.hasAnswer) {
      throw new ApiError(409, 'no_answer', 'Set an answer before enabling this surprise.');
    }
    await tx
      .update(surpriseEvents)
      .set({
        enabled: true,
        availableFrom: sql`now()`,
        availableUntil: sql`CASE WHEN ${surpriseEvents.availableUntil} > now() THEN ${surpriseEvents.availableUntil} END`,
      })
      .where(eq(surpriseEvents.id, row.id));
    await audit(tx, {
      ...actor(req, session),
      action: 'surprise.activate',
      entityType: 'surprise',
      entityId: row.id,
      details: { kind },
    });
  });

  return json({ ok: true });
});
