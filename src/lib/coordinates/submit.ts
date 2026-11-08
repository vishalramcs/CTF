import { sql } from 'drizzle-orm';

import { FRAGMENT_SLOTS } from '@/lib/coordinates/fragments';
import { normalizeFinal } from '@/lib/coordinates/normalize';
import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { coordinateSubmissions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { notifyBoard } from '@/lib/realtime/broadcast';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';

const WRONG_LIMIT = 8;

export type CoordinateResult =
  | { result: 'correct'; winner: boolean; points: number }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_completed' }
  | { result: 'locked' }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

type Executor = Pick<typeof db, 'execute'>;

// Fragments this team holds, from its own solves or Main Question beacons (docs/12). The space
// signal opens at all six (docs/13).
export async function heldFragmentCount(executor: Executor, teamId: string): Promise<number> {
  const [row] = await executor.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM app.challenges c
     WHERE c.fragment_value IS NOT NULL AND c.coordinate_order IS NOT NULL
       AND (EXISTS (SELECT 1 FROM app.solves s WHERE s.team_id = ${teamId} AND s.challenge_id = c.id)
            OR EXISTS (SELECT 1 FROM app.part_solves s JOIN app.challenge_parts p ON p.id = s.part_id
                        WHERE s.team_id = ${teamId} AND p.part = c.coordinate_order))`);
  return row.n;
}

// docs/13. The final race: a team holding all six fragments names the object in the space signal.
// Lock order is the team lock, then event_state FOR UPDATE, which also serialises the race so
// exactly one team becomes the winner. Exits before the attempt row write nothing.
async function submitCoordinatesTx(teamId: string, input: string): Promise<CoordinateResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:coordinates`}))`);
    const [state] = await tx.execute<{
      status: EventStatus;
      submissions_open: boolean;
      expected: string | null;
      alts: string[];
      winner: string | null;
      points: string;
      full: boolean;
    }>(sql`SELECT status, submissions_open, coordinate_answer_hash AS expected,
                  coordinate_answer_alt_hashes AS alts, coordinate_winner_id AS winner,
                  final_points AS points,
                  (SELECT full_access FROM app.teams WHERE id = ${teamId}) AS full
             FROM app.event_state WHERE id = 1 FOR UPDATE`);
    if ((!state.full && !canSubmit(state.status, state.submissions_open)) || !state.expected) {
      return { result: 'closed' };
    }
    if ((await heldFragmentCount(tx, teamId)) < FRAGMENT_SLOTS) return { result: 'locked' };

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
    const normalized = normalizeFinal(input);
    const hash = normalized ? hmacHex(env.COORD_HMAC_KEY, normalized) : '';
    const accepted = [state.expected, ...(state.alts ?? [])];
    const isCorrect = hash !== '' && accepted.some((h) => safeEqual(hash, h));
    await tx.insert(coordinateSubmissions).values({ teamId, submittedHash: hash, isCorrect });
    if (!isCorrect) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong };

    // Once per team: the ledger index on (team, ref_type, ref_id) with ref_id = the team.
    const points = Number(state.points);
    if (points > 0) {
      await tx.execute(sql`
        INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
        VALUES (${teamId}, 'location', ${points}, 'final_answer', ${teamId})
        ON CONFLICT DO NOTHING`);
    }

    // The row lock taken by the SELECT means no other team can reach this UPDATE meanwhile.
    // A tester can't take the win from a real team.
    const winner = state.winner === null && !state.full;
    await tx.execute(sql`UPDATE app.event_state SET
        scoreboard_version = scoreboard_version + 1, updated_at = now()
        ${winner ? sql`, coordinate_winner_id = ${teamId}::uuid, coordinate_won_at = now()` : sql``}
      WHERE id = 1`);
    return { result: 'correct', winner, points };
  });
}

export async function submitCoordinates(teamId: string, input: string): Promise<CoordinateResult> {
  const result = await submitCoordinatesTx(teamId, input);
  if (result.result === 'correct') await notifyBoard(); // after the commit
  return result;
}
