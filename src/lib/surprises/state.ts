import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

export const SURPRISE_KINDS = ['spidey_signal', 'flashy_spider', 'spider_mutation'] as const;
export type SurpriseKind = (typeof SURPRISE_KINDS)[number];

export function isSurpriseKind(value: string): value is SurpriseKind {
  return (SURPRISE_KINDS as readonly string[]).includes(value);
}

// In SQL so the database clock decides. Queries using it must alias surprise_events as `e`.
export const AVAILABLE = sql`(
  e.enabled AND e.answer_hash IS NOT NULL
  AND (e.available_from IS NULL OR e.available_from <= now())
  AND (e.available_until IS NULL OR e.available_until > now())
)`;

export type SurpriseSummary = {
  kind: SurpriseKind;
  discovered: boolean;
  completed: boolean;
  points: number;
};

// No title or content here: those come only from discovering. Anything neither available nor
// discovered is left out, so nothing reveals it early.
export async function listSurprises(teamId: string): Promise<SurpriseSummary[]> {
  const rows = await db.execute<{
    kind: SurpriseKind;
    discovered: boolean;
    completed: boolean;
    points: string;
  }>(sql`
    SELECT e.kind, p.team_id IS NOT NULL AS discovered, p.completed_at IS NOT NULL AS completed,
           e.points
    FROM app.surprise_events e
    LEFT JOIN app.surprise_progress p ON p.event_id = e.id AND p.team_id = ${teamId}
    WHERE p.team_id IS NOT NULL OR ${AVAILABLE}
    ORDER BY e.points`);
  return rows.map((row) => ({ ...row, points: Number(row.points) }));
}
