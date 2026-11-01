import { sql } from 'drizzle-orm';

import { normalizeLocation } from '@/lib/coordinates/normalize';
import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { coordinateSubmissions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { notifyBoard } from '@/lib/realtime/broadcast';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';

const WRONG_LIMIT = 8;

export type CoordinateResult =
  | { result: 'correct'; winner: boolean }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_completed' }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

// docs/08 §5. No points. Any team may submit, whether or not it solved anything: the answer can be
// worked out. Lock order is the team lock, then event_state FOR UPDATE, which also serialises the
// race so exactly one team becomes the winner. Exits before the attempt row write nothing.
async function submitCoordinatesTx(teamId: string, input: string): Promise<CoordinateResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:coordinates`}))`);
    const [state] = await tx.execute<{
      status: EventStatus;
      submissions_open: boolean;
      expected: string | null;
      winner: string | null;
    }>(sql`SELECT status, submissions_open, coordinate_answer_hash AS expected,
                  coordinate_winner_id AS winner
             FROM app.event_state WHERE id = 1 FOR UPDATE`);
    if (!canSubmit(state.status, state.submissions_open) || !state.expected) {
      return { result: 'closed' };
    }

    const [row] = await tx.execute<{
      done: boolean;
      wrong: number;
      retry_after: number | null;
    }>(sql`
      SELECT
        coalesce(bool_or(is_correct), false) AS done,
        count(*) FILTER (WHERE NOT is_correct AND submitted_at > now() - interval '60 seconds')::int
          AS wrong,
        ceil(extract(epoch from min(submitted_at) FILTER (WHERE NOT is_correct
          AND submitted_at > now() - interval '60 seconds') + interval '60 seconds' - now()))::int
          AS retry_after
      FROM app.coordinate_submissions WHERE team_id = ${teamId}`);
    if (row.done) return { result: 'already_completed' };
    if (row.wrong >= WRONG_LIMIT) {
      return { result: 'rate_limited', retryAfter: Math.max(row.retry_after ?? 1, 1) };
    }

    // A malformed answer stores '' as its hash. '' never matches.
    const normalized = normalizeLocation(input);
    const hash = normalized ? hmacHex(env.COORD_HMAC_KEY, normalized) : '';
    const isCorrect = safeEqual(hash, state.expected);
    await tx.insert(coordinateSubmissions).values({ teamId, submittedHash: hash, isCorrect });
    if (!isCorrect) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong };

    // The row lock taken by the SELECT means no other team can reach this UPDATE meanwhile.
    const winner = state.winner === null;
    await tx.execute(sql`UPDATE app.event_state SET
        scoreboard_version = scoreboard_version + 1, updated_at = now()
        ${winner ? sql`, coordinate_winner_id = ${teamId}::uuid, coordinate_won_at = now()` : sql``}
      WHERE id = 1`);
    return { result: 'correct', winner };
  });
}

export async function submitCoordinates(teamId: string, input: string): Promise<CoordinateResult> {
  const result = await submitCoordinatesTx(teamId, input);
  if (result.result === 'correct') await notifyBoard(); // after the commit
  return result;
}
