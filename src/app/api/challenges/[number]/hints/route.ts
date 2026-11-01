import { and, count, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { challengeHints, hintReveals } from '@/lib/db/schema';
import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { challengeAccess } from '@/lib/scoring/points';
import { findPublishedChallenge, getEventState } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

const HINTS_PER_MINUTE = 30;
const bodySchema = z.object({ index: z.number().int().min(1).max(100) });

export const POST = withTeam<{ number: string }>(async (req, session, { params }) => {
  const { index } = await parseBody(req, bodySchema);
  const challenge = await findPublishedChallenge((await params).number, session.teamId);
  if (!challenge) throw new ApiError(404, 'not_found', 'No such challenge.');

  const { status } = await getEventState();
  const access = challengeAccess(status);
  if (access !== 'open') throw new ApiError(423, access, 'This challenge is not open.');

  // shortcut: re-opening a hint adds no row, so only first reveals count. It's a sanity limit on a
  // free action; add a counter table if hint requests ever show up as load.
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(hintReveals)
    .where(
      and(
        eq(hintReveals.teamId, session.teamId),
        gt(hintReveals.revealedAt, sql`now() - interval '60 seconds'`),
      ),
    );
  if (recent >= HINTS_PER_MINUTE) throw new ApiError(429, 'rate_limited', 'Slow down.', 60);

  const [hint] = await db
    .select({ text: challengeHints.contentMd })
    .from(challengeHints)
    .where(and(eq(challengeHints.challengeId, challenge.id), eq(challengeHints.hintOrder, index)));
  if (!hint) throw new ApiError(404, 'not_found', 'No such hint.');

  await db
    .insert(hintReveals)
    .values({ teamId: session.teamId, challengeId: challenge.id, hintOrder: index })
    .onConflictDoNothing();
  return json({ hint: hint.text });
});
