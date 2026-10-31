import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { bumpBoard, lockEvent } from '@/lib/admin/event';
import { actor, parseUuid } from '@/lib/admin/http';
import { notifyBoard } from '@/lib/admin/notify';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { challenges, scoreTransactions, solves } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ confirm: z.literal('RESET') });

// docs/08 §7. Deletes one question's solves and their ledger rows, nothing else. Submissions and
// attempt history stay. Event lock first, like every other state change.
export const POST = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  await parseBody(req, body);

  const removed = await db.transaction(async (tx) => {
    await lockEvent(tx);
    const [challenge] = await tx
      .select({ number: challenges.number })
      .from(challenges)
      .where(eq(challenges.id, id))
      .for('update');
    if (!challenge) throw new ApiError(404, 'not_found', 'Challenge not found.');
    const rows = await tx
      .delete(solves)
      .where(eq(solves.challengeId, id))
      .returning({ id: solves.id });
    if (rows.length > 0) {
      await tx.delete(scoreTransactions).where(
        and(
          eq(scoreTransactions.refType, 'solve'),
          inArray(
            scoreTransactions.refId,
            rows.map((r) => r.id),
          ),
        ),
      );
    }
    await bumpBoard(tx);
    await audit(tx, {
      ...actor(req, session),
      action: 'challenge.reset_solves',
      entityType: 'challenge',
      entityId: id,
      details: { number: challenge.number, solvesRemoved: rows.length },
    });
    return rows.length;
  });

  await notifyBoard();
  return json({ removed });
});
