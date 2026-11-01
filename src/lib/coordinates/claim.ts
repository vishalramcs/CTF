import { and, eq, sql } from 'drizzle-orm';

import { bumpBoard } from '@/lib/admin/event';
import { db } from '@/lib/db/client';
import { challenges, fragmentClaimAttempts, fragmentClaims, solves } from '@/lib/db/schema';
import { notifyBoard } from '@/lib/realtime/broadcast';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';

const WRONG_LIMIT = 8;

export type ClaimResult =
  | { result: 'correct'; fragment: string; orderClue: string | null }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_claimed' }
  | { result: 'not_solved' }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

// "N*51.5072", "[n* 51.5072]" and "N 51.5072" are one answer. Anything else is simply wrong.
export function normalizeEntry(input: string): string | null {
  const match = input.trim().match(/^\[?\s*([nsew])\s*\*?\s*(\d{1,3}\.\d{4})\s*\]?$/i);
  return match ? `${match[1].toUpperCase()} ${match[2]}` : null;
}

// The answer an admin's stored fragment stands for: "51.5072° N" or ", 0.1276° W".
export function fragmentAnswer(fragment: string): string | null {
  const match = fragment.match(/(\d{1,3}\.\d{4})\s*°?\s*([NSEW])/i);
  return match ? `${match[2].toUpperCase()} ${match[1]}` : null;
}

async function claimTx(
  teamId: string,
  challenge: { id: string },
  input: string,
): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:${challenge.id}`}))`);

    // FOR SHARE: a status change waits for this commit.
    const [state] = await tx.execute<{ status: EventStatus; submissions_open: boolean }>(
      sql`SELECT status, submissions_open FROM app.event_state WHERE id = 1 FOR SHARE`,
    );
    if (!canSubmit(state.status, state.submissions_open)) return { result: 'closed' };

    // The flag comes first: only a team that solved this question has anything to claim.
    const [row] = await tx
      .select({
        value: challenges.fragmentValue,
        orderClue: challenges.orderClue,
        needsEntry: challenges.fragmentNeedsEntry,
        solvedId: solves.id,
      })
      .from(challenges)
      .leftJoin(solves, and(eq(solves.challengeId, challenges.id), eq(solves.teamId, teamId)))
      .where(eq(challenges.id, challenge.id));
    if (!row?.solvedId || !row.value || !row.needsEntry) return { result: 'not_solved' };

    const [claimed] = await tx
      .select({ teamId: fragmentClaims.teamId })
      .from(fragmentClaims)
      .where(and(eq(fragmentClaims.teamId, teamId), eq(fragmentClaims.challengeId, challenge.id)));
    if (claimed) return { result: 'already_claimed' };

    const [recent] = await tx.execute<{ wrong: number; retry_after: number | null }>(sql`
      SELECT count(*)::int AS wrong,
             ceil(extract(epoch from min(submitted_at) + interval '60 seconds' - now()))::int
               AS retry_after
      FROM app.fragment_claim_attempts
      WHERE team_id = ${teamId} AND challenge_id = ${challenge.id}
        AND NOT is_correct AND submitted_at > now() - interval '60 seconds'`);
    if (recent.wrong >= WRONG_LIMIT) {
      return { result: 'rate_limited', retryAfter: Math.max(recent.retry_after ?? 1, 1) };
    }

    const entry = normalizeEntry(input);
    const isCorrect = entry !== null && entry === fragmentAnswer(row.value);
    await tx.insert(fragmentClaimAttempts).values({ teamId, challengeId: challenge.id, isCorrect });
    if (!isCorrect) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - recent.wrong };

    await tx.insert(fragmentClaims).values({ teamId, challengeId: challenge.id });
    // A team's other open tabs re-read their board when this version changes.
    await bumpBoard(tx);
    return { result: 'correct', fragment: row.value, orderClue: row.orderClue };
  });
}

export async function claimFragment(...args: Parameters<typeof claimTx>): Promise<ClaimResult> {
  const result = await claimTx(...args);
  if (result.result === 'correct') await notifyBoard(); // after the commit
  return result;
}
