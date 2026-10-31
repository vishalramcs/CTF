import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { surpriseEvents } from '@/lib/db/schema';

// Never selects answer_hash or answer_enc: the form only learns whether an answer is set.
export async function loadSurprises() {
  const rows = await db
    .select({
      id: surpriseEvents.id,
      kind: surpriseEvents.kind,
      title: surpriseEvents.title,
      enabled: surpriseEvents.enabled,
      availableFrom: surpriseEvents.availableFrom,
      availableUntil: surpriseEvents.availableUntil,
      contentHtml: surpriseEvents.contentHtml,
      assetUrl: surpriseEvents.assetUrl,
      hasAnswer: surpriseEvents.answerHash,
      points: surpriseEvents.points,
    })
    .from(surpriseEvents)
    .orderBy(surpriseEvents.points);
  const progress = await db.execute<{
    event_id: string;
    team_name: string;
    discovered_at: Date;
    completed_at: Date | null;
  }>(sql`SELECT p.event_id, t.name AS team_name, p.discovered_at, p.completed_at
    FROM app.surprise_progress p JOIN app.teams t ON t.id = p.team_id
    ORDER BY p.discovered_at`);
  return rows.map(({ hasAnswer, points, ...row }) => {
    const teams = progress
      .filter((p) => p.event_id === row.id)
      .map((p) => ({
        team: p.team_name,
        discoveredAt: p.discovered_at,
        completedAt: p.completed_at,
      }));
    return {
      ...row,
      hasAnswer: hasAnswer !== null,
      points: Number(points),
      completions: teams.filter((t) => t.completedAt).length,
      teams,
    };
  });
}
