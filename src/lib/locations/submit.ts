import { eq, sql } from 'drizzle-orm';

import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import {
  type challengeDifficulty,
  locationAchievements,
  locations,
  locationSubmissions,
  scoreTransactions,
  teamCosmicKeys,
} from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalizeLocation } from '@/lib/locations/normalize';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';

const WRONG_LIMIT = 5;

export type LocationLevel = (typeof challengeDifficulty.enumValues)[number];

export type LocationSubmitResult =
  | { result: 'correct'; points: number; key: { name: string }; finalMission: boolean }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_completed' }
  | { result: 'locked'; fragmentsHeld: number; fragmentsRequired: number }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

// docs/07 §4. Exits before the attempt row write nothing, so hammering can't extend a lockout. The
// unique indexes back up the lock: a repeat would roll back the whole payout, never pay twice.
export async function submitLocation(
  { teamId }: { teamId: string },
  level: LocationLevel,
  input: string,
): Promise<LocationSubmitResult> {
  return db.transaction(async (tx) => {
    // Migration 0003 seeds all four levels and a wipe keeps them.
    const [{ id }] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.level, level));
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:location:${id}`}))`);

    // FOR SHARE: a status change waits for this commit.
    const [state] = await tx.execute<{ status: EventStatus; submissions_open: boolean }>(
      sql`SELECT status, submissions_open FROM app.event_state WHERE id = 1 FOR SHARE`,
    );
    if (!canSubmit(state.status, state.submissions_open)) return { result: 'closed' };

    const [row] = await tx.execute<{
      expected: string | null;
      points: string;
      required: number;
      key_id: string;
      key_name: string;
      completed: boolean;
      held: number;
      wrong: number;
      retry_after: number | null;
    }>(sql`
      SELECT
        l.answer_hash AS expected,
        l.reward_points AS points,
        l.fragments_required AS required,
        k.id AS key_id,
        k.name AS key_name,
        EXISTS (SELECT 1 FROM app.location_achievements
                WHERE team_id = ${teamId} AND location_id = l.id) AS completed,
        (SELECT count(*)::int FROM app.v_team_fragments
         WHERE team_id = ${teamId} AND location_id = l.id) AS held,
        recent.wrong,
        recent.retry_after
      FROM app.locations l
      JOIN app.cosmic_keys k ON k.level = l.level
      CROSS JOIN (
        SELECT count(*)::int AS wrong,
               ceil(extract(epoch from min(submitted_at) + interval '60 seconds' - now()))::int
                 AS retry_after
        FROM app.location_submissions
        WHERE team_id = ${teamId} AND location_id = ${id}
          AND NOT is_correct AND submitted_at > now() - interval '60 seconds'
      ) recent
      WHERE l.id = ${id}`);
    if (row.completed) return { result: 'already_completed' };
    if (row.held < row.required) {
      return { result: 'locked', fragmentsHeld: row.held, fragmentsRequired: row.required };
    }
    if (!row.expected) return { result: 'closed' };
    if (row.wrong >= WRONG_LIMIT) {
      return { result: 'rate_limited', retryAfter: Math.max(row.retry_after ?? 1, 1) };
    }

    // A malformed answer stores '' as its hash, like a malformed flag. '' never matches.
    const normalized = normalizeLocation(input);
    const hash = normalized ? hmacHex(env.COORD_HMAC_KEY, normalized) : '';
    const isCorrect = safeEqual(hash, row.expected);
    await tx
      .insert(locationSubmissions)
      .values({ teamId, locationId: id, submittedHash: hash, isCorrect });
    if (!isCorrect) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong };

    await tx.insert(locationAchievements).values({ teamId, locationId: id });
    await tx.insert(scoreTransactions).values({
      teamId,
      category: 'location',
      points: row.points,
      refType: 'location',
      refId: id,
    });
    await tx.insert(teamCosmicKeys).values({ teamId, keyId: row.key_id });

    return {
      result: 'correct',
      points: Number(row.points),
      key: { name: row.key_name },
      finalMission: level === 'main_difficult',
    };
  });
}
