import { sql } from 'drizzle-orm';

import { normalizeLocation } from '@/lib/coordinates/normalize';
import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { notifyBoard } from '@/lib/realtime/broadcast';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';

const WRONG_LIMIT = 8;

export type LocationResult =
  | { result: 'correct'; points: number; label: string }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_answered' }
  | { result: 'locked' }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

// docs/12. A team that holds both fragments of a location may name the place. The answer is the
// organiser's label in app.final_coordinates, compared loosely and only here. A correct answer pays
// event_state.location_points once per team and location (unique index plus ledger index).
async function submitLocationTx(
  teamId: string,
  position: number,
  input: string,
): Promise<LocationResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:location`}))`);
    const [state] = await tx.execute<{
      status: EventStatus;
      submissions_open: boolean;
      points: string;
      full: boolean;
    }>(sql`SELECT status, submissions_open, location_points AS points,
             (SELECT full_access FROM app.teams WHERE id = ${teamId}) AS full
           FROM app.event_state WHERE id = 1 FOR SHARE`);
    if (!state.full && !canSubmit(state.status, state.submissions_open)) {
      return { result: 'closed' };
    }

    // Both halves of this location, from the team's own solves or Main Question beacons.
    const [held] = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM app.challenges c
       WHERE c.coordinate_order IN (${2 * position - 1}, ${2 * position})
         AND (EXISTS (SELECT 1 FROM app.solves s WHERE s.team_id = ${teamId} AND s.challenge_id = c.id)
              OR EXISTS (SELECT 1 FROM app.part_solves s JOIN app.challenge_parts p ON p.id = s.part_id
                          WHERE s.team_id = ${teamId} AND p.part = c.coordinate_order))`);
    if (held.n < 2) return { result: 'locked' };

    const [row] = await tx.execute<{
      done: boolean;
      wrong: number;
      retry_after: number | null;
    }>(sql`
      SELECT coalesce(bool_or(is_correct) FILTER (WHERE position = ${position}), false) AS done,
             count(*) FILTER (WHERE NOT is_correct AND submitted_at > now() - interval '60 seconds')::int AS wrong,
             ceil(extract(epoch from min(submitted_at) FILTER (WHERE NOT is_correct
               AND submitted_at > now() - interval '60 seconds') + interval '60 seconds' - now()))::int
               AS retry_after
        FROM app.location_answers WHERE team_id = ${teamId}`);
    if (row.done) return { result: 'already_answered' };
    if (row.wrong >= WRONG_LIMIT) {
      return { result: 'rate_limited', retryAfter: Math.max(row.retry_after ?? 1, 1) };
    }

    const [place] = await tx.execute<{ label: string }>(sql`
      SELECT label FROM app.final_coordinates WHERE position = ${position}`);
    const given = normalizeLocation(input);
    const expected = place ? normalizeLocation(place.label) : null;
    const hash = given ? hmacHex(env.COORD_HMAC_KEY, given) : '';
    const correct =
      given !== null && expected !== null && safeEqual(hash, hmacHex(env.COORD_HMAC_KEY, expected));
    const [answer] = await tx.execute<{ id: string }>(sql`
      INSERT INTO app.location_answers (team_id, position, submitted_hash, is_correct)
      VALUES (${teamId}, ${position}, ${hash}, ${correct}) RETURNING id`);
    if (!correct) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong };

    const points = Number(state.points);
    if (points > 0) {
      await tx.execute(sql`
        INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
        VALUES (${teamId}, 'location', ${points}, 'location_answer', ${answer.id})`);
    }
    return { result: 'correct', points, label: place.label };
  });
}

export async function submitLocation(teamId: string, position: number, input: string) {
  const result = await submitLocationTx(teamId, position, input);
  if (result.result === 'correct') await notifyBoard(); // after the commit
  return result;
}
