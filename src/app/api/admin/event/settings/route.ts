import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bumpBoard, lockEvent, snapshotBoard } from '@/lib/admin/event';
import { actor, localDateTime } from '@/lib/admin/http';
import { notifyBoard, notifyStatus } from '@/lib/admin/notify';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z
  .object({
    submissionsOpen: z.boolean().optional(),
    leaderboardFrozen: z.boolean().optional(),
    decoderReleased: z.boolean().optional(),
    // Finale time in EVENT_TIMEZONE; null clears it. /api/public/state freezes the board after it.
    freezeAt: localDateTime.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

export const POST = withAdmin(async (req, session) => {
  const { submissionsOpen, leaderboardFrozen, decoderReleased, freezeAt } = await parseBody(
    req,
    body,
  );

  const result = await db.transaction(async (tx) => {
    const state = await lockEvent(tx);
    const froze = leaderboardFrozen === true && !state.leaderboardFrozen;
    const changed = {
      submissionsOpen: submissionsOpen !== undefined && submissionsOpen !== state.submissionsOpen,
      leaderboardFrozen:
        leaderboardFrozen !== undefined && leaderboardFrozen !== state.leaderboardFrozen,
      decoderReleased: decoderReleased !== undefined && decoderReleased !== state.decoderReleased,
    };

    if (changed.decoderReleased) {
      await tx.update(eventState).set({ decoderReleased }).where(eq(eventState.id, 1));
    }
    if (changed.submissionsOpen) {
      await tx.update(eventState).set({ submissionsOpen }).where(eq(eventState.id, 1));
    }
    if (changed.leaderboardFrozen) {
      if (froze) await snapshotBoard(tx, session.userId);
      // An admin unfreeze also clears the finale time, or the next read would freeze again.
      await tx
        .update(eventState)
        .set({ leaderboardFrozen, ...(leaderboardFrozen ? {} : { freezeAt: null }) })
        .where(eq(eventState.id, 1));
    }
    if (freezeAt !== undefined) {
      await tx
        .update(eventState)
        .set({
          freezeAt:
            freezeAt === null
              ? null
              : sql`${freezeAt}::timestamp AT TIME ZONE ${env.EVENT_TIMEZONE}`,
        })
        .where(eq(eventState.id, 1));
    }
    // The version bump also makes each dashboard re-read, which is how the decoder appears.
    if (changed.submissionsOpen || changed.leaderboardFrozen || changed.decoderReleased) {
      await bumpBoard(tx);
    }
    await audit(tx, {
      ...actor(req, session),
      action: 'event.settings',
      entityType: 'event',
      details: { submissionsOpen, leaderboardFrozen, decoderReleased, freezeAt, changed },
    });
    return changed;
  });

  if (result.leaderboardFrozen || result.decoderReleased) await notifyBoard();
  if (result.submissionsOpen) await notifyStatus();
  return json({ ok: true });
});
