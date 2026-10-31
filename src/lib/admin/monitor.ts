import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

// Flag, location and surprise attempts, newest first. Only what happened: no hashes, no answers.
export async function listAttempts(teamId: string | undefined, limit: number) {
  const only = (column: string) =>
    teamId ? sql`WHERE ${sql.raw(column)} = ${teamId}::uuid` : sql``;
  const rows = await db.execute<{
    kind: string;
    team: string;
    target: string;
    result: string;
    at: Date;
  }>(sql`SELECT * FROM (
      SELECT 'flag' AS kind, t.name AS team, '#' || c.number AS target, s.result, s.submitted_at AS at
        FROM app.submissions s JOIN app.teams t ON t.id = s.team_id
        JOIN app.challenges c ON c.id = s.challenge_id ${only('s.team_id')}
      UNION ALL
      SELECT 'location', t.name, l.level::text,
             CASE WHEN s.is_correct THEN 'correct' ELSE 'wrong' END, s.submitted_at
        FROM app.location_submissions s JOIN app.teams t ON t.id = s.team_id
        JOIN app.locations l ON l.id = s.location_id ${only('s.team_id')}
      UNION ALL
      SELECT 'surprise', t.name, e.kind,
             CASE WHEN s.is_correct THEN 'correct' ELSE 'wrong' END, s.submitted_at
        FROM app.surprise_submissions s JOIN app.teams t ON t.id = s.team_id
        JOIN app.surprise_events e ON e.id = s.event_id ${only('s.team_id')}
    ) a ORDER BY at DESC LIMIT ${limit}`);
  return [...rows];
}
