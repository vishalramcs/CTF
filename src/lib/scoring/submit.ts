import { eq, sql } from 'drizzle-orm';

import {
  allFragmentsFor,
  finalCoordinatesFor,
  type FinalCoordinate,
  type FragmentRef,
} from '@/lib/coordinates/state';

import { db } from '@/lib/db/client';
import { challenges, solves, submissions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { checkFlag } from '@/lib/flags/verify';
import { notifyBoard } from '@/lib/realtime/broadcast';
import { partsOf, submitPart, type PartResult } from '@/lib/scoring/parts';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';

const WRONG_LIMIT = 8;
const PREVIEW_LENGTH = 12;

export type SubmitResult =
  | {
      result: 'correct';
      points: number;
      position: number;
      fragment?: string;
      orderClue?: string;
      finalCoordinates?: FinalCoordinate[];
      fragments?: FragmentRef[];
    }
  | PartResult
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_solved' }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

// TRD §8.4 and 05 §5, in that order. Closed, solved and rate-limited exit before the attempt row,
// as the recipe says: the result column can't hold them, and counting them would extend a lockout.
// Position, decayed points and the ledger row are set by the database trigger (migration 0003),
// under one lock per challenge, so this only inserts the team and the challenge.
async function submitFlagTx(
  { teamId, sessionId }: { teamId: string; sessionId: string },
  challenge: { id: string },
  input: string,
): Promise<SubmitResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:${challenge.id}`}))`);

    // FOR SHARE: a status change waits for this commit.
    const [state] = await tx.execute<{
      status: EventStatus;
      submissions_open: boolean;
      full: boolean;
    }>(sql`SELECT status, submissions_open,
             (SELECT full_access FROM app.teams WHERE id = ${teamId}) AS full
           FROM app.event_state WHERE id = 1 FOR SHARE`);
    if (!state.full && !canSubmit(state.status, state.submissions_open)) {
      return { result: 'closed' };
    }

    // One round trip for the solved check, the wrong count and the expected hash.
    const [row] = await tx.execute<{
      solved: boolean;
      wrong: number;
      retry_after: number | null;
      expected: string | null;
    }>(sql`
      SELECT
        EXISTS (SELECT 1 FROM app.solves
                WHERE team_id = ${teamId} AND challenge_id = ${challenge.id}) AS solved,
        recent.wrong,
        recent.retry_after,
        (SELECT expected_flag_hash FROM app.team_challenge_variants
         WHERE team_id = ${teamId} AND challenge_id = ${challenge.id}) AS expected
      FROM (
        SELECT count(*)::int AS wrong,
               ceil(extract(epoch from min(submitted_at) + interval '60 seconds' - now()))::int
                 AS retry_after
        FROM app.submissions
        WHERE team_id = ${teamId} AND challenge_id = ${challenge.id}
          AND NOT is_correct AND submitted_at > now() - interval '60 seconds'
      ) recent`);
    if (row.solved) return { result: 'already_solved' };
    if (row.wrong >= WRONG_LIMIT) {
      return { result: 'rate_limited', retryAfter: Math.max(row.retry_after ?? 1, 1) };
    }

    // The Main Question's six beacon flags (docs/12): any unfound one is accepted in the same box.
    const parts = await partsOf(tx, challenge.id);
    if (parts.length > 0) {
      const outcome = await submitPart(tx, { teamId, sessionId }, challenge.id, parts, input, (v) =>
        v.trim().replaceAll('\0', '').slice(0, PREVIEW_LENGTH),
      );
      return outcome.result === 'wrong'
        ? { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong }
        : outcome;
    }

    const { result, hash } = checkFlag(input, row.expected ?? '', {
      flagKey: env.FLAG_HMAC_KEY,
      flagPrefix: env.FLAG_PREFIX,
    });
    const isCorrect = result === 'correct';
    await tx.insert(submissions).values({
      teamId,
      challengeId: challenge.id,
      sessionId,
      submittedHash: hash,
      // Postgres text can't hold NUL, and a team can send one.
      submittedPreview: isCorrect
        ? null
        : input.trim().replaceAll('\0', '').slice(0, PREVIEW_LENGTH),
      isCorrect,
      result,
    });
    if (!isCorrect) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong };

    const [solve] = await tx
      .insert(solves)
      .values({ teamId, challengeId: challenge.id })
      .onConflictDoNothing({ target: [solves.teamId, solves.challengeId] })
      .returning({ points: solves.pointsAwarded, position: solves.solvePosition });
    if (!solve) return { result: 'already_solved' };

    // Fragment and final coordinates are shown only now that the team has earned them.
    const [earned] = await tx
      .select({
        value: challenges.fragmentValue,
        orderClue: challenges.orderClue,
        difficulty: challenges.difficulty,
      })
      .from(challenges)
      .where(eq(challenges.id, challenge.id));
    // A fragment-bearing question or the Main Question can complete a location. Read inside this
    // transaction, so it includes the solve just inserted.
    const isMain = earned.difficulty === 'main_difficult';
    const final = isMain || earned.value ? await finalCoordinatesFor(tx, teamId) : null;
    // The Main Question grants every fragment at once.
    const fragments = isMain ? await allFragmentsFor(tx, teamId) : null;

    return {
      result: 'correct',
      points: Number(solve.points),
      position: solve.position,
      ...(earned.value ? { fragment: earned.value } : {}),
      ...(earned.value && earned.orderClue ? { orderClue: earned.orderClue } : {}),
      ...(final ? { finalCoordinates: final } : {}),
      ...(fragments && fragments.length > 0 ? { fragments } : {}),
    };
  });
}

export async function submitFlag(...args: Parameters<typeof submitFlagTx>): Promise<SubmitResult> {
  const result = await submitFlagTx(...args);
  if (result.result === 'correct' || result.result === 'part') await notifyBoard(); // after the commit
  return result;
}
