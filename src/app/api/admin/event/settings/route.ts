import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { bumpBoard, lockEvent } from '@/lib/admin/event';
import { actor } from '@/lib/admin/http';
import { notifyBoard, notifyStatus } from '@/lib/admin/notify';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z
  .object({ submissionsOpen: z.boolean().optional(), leaderboardFrozen: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0);

export const POST = withAdmin(async (req, session) => {
  const { submissionsOpen, leaderboardFrozen } = await parseBody(req, body);

  const result = await db.transaction(async (tx) => {
    const state = await lockEvent(tx);
    const froze = leaderboardFrozen === true && !state.leaderboardFrozen;
    const changed = {
      submissionsOpen: submissionsOpen !== undefined && submissionsOpen !== state.submissionsOpen,
      leaderboardFrozen:
        leaderboardFrozen !== undefined && leaderboardFrozen !== state.leaderboardFrozen,
    };

    if (changed.submissionsOpen) {
      await tx.update(eventState).set({ submissionsOpen }).where(eq(eventState.id, 1));
    }
    if (changed.leaderboardFrozen) {
      // The frozen board is what this snapshot holds, taken in the same transaction as the flag.
      if (froze) {
        await tx.execute(sql`INSERT INTO app.scoreboard_snapshots (snapshot, created_by)
          SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.rank), '[]'::jsonb), ${session.userId}::uuid
          FROM app.v_public_scoreboard s`);
      }
      await tx.update(eventState).set({ leaderboardFrozen }).where(eq(eventState.id, 1));
    }
    if (changed.submissionsOpen || changed.leaderboardFrozen) await bumpBoard(tx);
    await audit(tx, {
      ...actor(req, session),
      action: 'event.settings',
      entityType: 'event',
      details: { submissionsOpen, leaderboardFrozen, changed },
    });
    return changed;
  });

  if (result.leaderboardFrozen) await notifyBoard();
  if (result.submissionsOpen) await notifyStatus();
  return json({ ok: true });
});
