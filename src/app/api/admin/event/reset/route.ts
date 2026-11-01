import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { lockEvent } from '@/lib/admin/event';
import { actor } from '@/lib/admin/http';
import { notifyBoard, notifyStatus } from '@/lib/admin/notify';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import {
  eventState,
  fragmentClaimAttempts,
  fragmentClaims,
  hintReveals,
  coordinateSubmissions,
  scoreboardSnapshots,
  scoreTransactions,
  solves,
  submissions,
  surpriseProgress,
  surpriseSubmissions,
  teamChallengeUnlocks,
  workspaceDeletions,
} from '@/lib/db/schema';
import { json, parseBody, withSuperAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ confirm: z.literal('RESET') });

// Clears every team's progress and nothing else: teams, challenges, the final location answer, surprises and
// announcements stay. Children go first; none of these tables references another here.
export const POST = withSuperAdmin(async (req, session) => {
  await parseBody(req, body);

  await db.transaction(async (tx) => {
    await lockEvent(tx);
    await tx.delete(solves);
    await tx.delete(submissions);
    await tx.delete(scoreTransactions);
    await tx.delete(coordinateSubmissions);
    await tx.delete(surpriseProgress);
    await tx.delete(surpriseSubmissions);
    await tx.delete(hintReveals);
    await tx.delete(fragmentClaims);
    await tx.delete(fragmentClaimAttempts);
    await tx.delete(teamChallengeUnlocks);
    await tx.delete(workspaceDeletions);
    await tx.delete(scoreboardSnapshots);
    // A freeze with no snapshot left would show nothing, so it ends with the reset.
    await tx
      .update(eventState)
      .set({
        status: 'not_started',
        statusChangedAt: sql`now()`,
        leaderboardFrozen: false,
        freezeAt: null,
        coordinateWinnerId: null,
        coordinateWonAt: null,
        scoreboardVersion: sql`${eventState.scoreboardVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(eventState.id, 1));
    await audit(tx, {
      ...actor(req, session),
      action: 'event.reset',
      entityType: 'event',
    });
  });

  await notifyStatus();
  await notifyBoard();
  return json({ ok: true });
});
