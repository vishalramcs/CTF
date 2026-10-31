import { and, eq, sql } from 'drizzle-orm';

import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { scoreTransactions, surpriseProgress, surpriseSubmissions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';
import { sanitizeHtml } from '@/lib/variants/sanitize';

import { AVAILABLE, type SurpriseKind } from './state';

const WRONG_LIMIT = 5;

export type DiscoverResult =
  | {
      result: 'ok';
      kind: SurpriseKind;
      title: string;
      html: string;
      assetUrl: string | null;
      points: number;
      completed: boolean;
    }
  | { result: 'unavailable' };

export type SurpriseSubmitResult =
  | { result: 'correct'; points: number }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'already_completed' }
  | { result: 'unavailable' }
  | { result: 'rate_limited'; retryAfter: number }
  | { result: 'closed' };

// The stored form of an answer: whoever configures one must hash it with this too.
export function hashSurpriseAnswer(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  return hmacHex(env.FLAG_HMAC_KEY, `surprise:${normalized}`);
}

// One statement, so availability can't change between the check and the insert. ON CONFLICT keeps
// the first discovery time. The SELECT can't see the CTE's insert, hence the AVAILABLE repeat.
export async function discoverSurprise(
  teamId: string,
  kind: SurpriseKind,
): Promise<DiscoverResult> {
  const [row] = await db.execute<{
    title: string;
    content_html: string;
    asset_url: string | null;
    points: string;
    completed: boolean;
  }>(sql`
    WITH added AS (
      INSERT INTO app.surprise_progress (team_id, event_id)
      SELECT ${teamId}::uuid, e.id FROM app.surprise_events e
      WHERE e.kind = ${kind} AND ${AVAILABLE}
      ON CONFLICT DO NOTHING
    )
    SELECT e.title, e.content_html, e.asset_url, e.points, p.completed_at IS NOT NULL AS completed
    FROM app.surprise_events e
    LEFT JOIN app.surprise_progress p ON p.event_id = e.id AND p.team_id = ${teamId}
    WHERE e.kind = ${kind} AND (p.team_id IS NOT NULL OR ${AVAILABLE})`);
  if (!row) return { result: 'unavailable' };
  return {
    result: 'ok',
    kind,
    title: row.title,
    html: sanitizeHtml(row.content_html),
    assetUrl: row.asset_url,
    points: Number(row.points),
    completed: row.completed,
  };
}

// Same shape as submitFlag: blocked attempts exit before the attempt row, so hammering can't extend
// a lockout. The points come straight from the event row and go to the ledger unchanged.
export async function submitSurprise(
  teamId: string,
  kind: SurpriseKind,
  input: string,
): Promise<SurpriseSubmitResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${teamId}::text || ':surprise:' || id::text))
      FROM app.surprise_events WHERE kind = ${kind}`);

    // FOR SHARE: a status change waits for this commit.
    const [state] = await tx.execute<{ status: EventStatus; submissions_open: boolean }>(
      sql`SELECT status, submissions_open FROM app.event_state WHERE id = 1 FOR SHARE`,
    );
    if (!canSubmit(state.status, state.submissions_open)) return { result: 'closed' };

    const [row] = await tx.execute<{
      id: string;
      expected: string | null;
      points: string;
      available: boolean;
      discovered: boolean;
      completed: boolean;
      wrong: number;
      retry_after: number | null;
    }>(sql`
      SELECT e.id, e.answer_hash AS expected, e.points, ${AVAILABLE} AS available,
             p.team_id IS NOT NULL AS discovered, p.completed_at IS NOT NULL AS completed,
             recent.wrong, recent.retry_after
      FROM app.surprise_events e
      LEFT JOIN app.surprise_progress p ON p.event_id = e.id AND p.team_id = ${teamId}
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS wrong,
               ceil(extract(epoch from min(s.submitted_at) + interval '60 seconds' - now()))::int
                 AS retry_after
        FROM app.surprise_submissions s
        WHERE s.team_id = ${teamId} AND s.event_id = e.id
          AND NOT s.is_correct AND s.submitted_at > now() - interval '60 seconds'
      ) recent
      WHERE e.kind = ${kind}`);
    if (row.completed) return { result: 'already_completed' };
    if (!row.available || !row.discovered) return { result: 'unavailable' };
    if (row.wrong >= WRONG_LIMIT) {
      return { result: 'rate_limited', retryAfter: Math.max(row.retry_after ?? 1, 1) };
    }

    const hash = hashSurpriseAnswer(input);
    const isCorrect = input.trim() !== '' && safeEqual(hash, row.expected ?? '');
    await tx
      .insert(surpriseSubmissions)
      .values({ eventId: row.id, teamId, submittedHash: hash, isCorrect });
    if (!isCorrect) return { result: 'wrong', attemptsLeft: WRONG_LIMIT - 1 - row.wrong };

    await tx
      .update(surpriseProgress)
      .set({ completedAt: sql`now()` })
      .where(and(eq(surpriseProgress.teamId, teamId), eq(surpriseProgress.eventId, row.id)));
    await tx.insert(scoreTransactions).values({
      teamId,
      category: 'surprise',
      points: row.points,
      refType: 'surprise',
      refId: row.id,
    });
    return { result: 'correct', points: Number(row.points) };
  });
}
