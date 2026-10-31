import { and, eq, isNull, sql } from 'drizzle-orm';

import type { SessionEndReason } from '@/lib/auth/shared';
import { db } from '@/lib/db/client';
import { sessions, teams, users, vScoreboard } from '@/lib/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// One team name per line. A blank line is skipped; a duplicate or odd-sized name is an error.
export function parseTeamNames(text: string): { names: string[]; errors: string[] } {
  const names: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (name.length < 2 || name.length > 40) {
      errors.push(`Line ${index + 1}: a name needs 2–40 characters.`);
    } else if (seen.has(name.toLowerCase())) {
      errors.push(`Line ${index + 1}: "${name}" is listed twice.`);
    } else {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  });
  return { names, errors };
}

export function uniqueHandle(base: string, taken: Set<string>): string {
  let handle = base || 'team';
  for (let n = 2; taken.has(handle); n++) handle = `${base || 'team'}-${n}`;
  taken.add(handle);
  return handle;
}

export async function revokeTeamSessions(
  tx: Tx,
  teamId: string,
  reason: SessionEndReason,
): Promise<number> {
  const revoked = await tx
    .update(sessions)
    .set({ revokedAt: sql`now()`, revokeReason: reason })
    .where(and(eq(sessions.teamId, teamId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length;
}

export function listTeams() {
  const active = sql`s.team_id = ${teams.id} AND s.revoked_at IS NULL AND s.expires_at > now()`;
  return db
    .select({
      id: teams.id,
      name: teams.name,
      username: users.username,
      isActive: teams.isActive,
      isHidden: teams.isHidden,
      activeSessions: sql<number>`(SELECT count(*)::int FROM app.sessions s WHERE ${active})`,
      lastSeenAt:
        sql<Date | null>`(SELECT max(s.last_seen_at) FROM app.sessions s WHERE ${active})`.mapWith(
          sessions.lastSeenAt,
        ),
      score: vScoreboard.total,
    })
    .from(teams)
    .innerJoin(users, eq(users.teamId, teams.id))
    .innerJoin(vScoreboard, eq(vScoreboard.teamId, teams.id))
    .orderBy(teams.name);
}

export type TeamRow = Awaited<ReturnType<typeof listTeams>>[number];

// Everything the team page shows, one query after another (single pooled connection).
export async function loadTeamDetail(id: string) {
  const [team] = await db
    .select({ id: teams.id, name: teams.name, isActive: teams.isActive, isHidden: teams.isHidden })
    .from(teams)
    .where(eq(teams.id, id));
  if (!team) return undefined;
  const [score] = await db.select().from(vScoreboard).where(eq(vScoreboard.teamId, id));
  const solved = await db.execute<{
    number: number;
    title: string;
    solve_position: number;
    points_awarded: string;
    solved_at: Date;
  }>(sql`SELECT c.number, c.title, s.solve_position, s.points_awarded, s.solved_at
    FROM app.solves s JOIN app.challenges c ON c.id = s.challenge_id
    WHERE s.team_id = ${id} ORDER BY s.solved_at`);
  const failed = await db.execute<{
    number: number;
    submitted_preview: string | null;
    result: string;
    submitted_at: Date;
  }>(sql`SELECT c.number, s.submitted_preview, s.result, s.submitted_at
    FROM app.submissions s JOIN app.challenges c ON c.id = s.challenge_id
    WHERE s.team_id = ${id} AND NOT s.is_correct ORDER BY s.submitted_at DESC LIMIT 100`);
  const locations = await db.execute<{ level: string; name: string; achieved_at: Date }>(sql`
    SELECT l.level, l.name, a.achieved_at FROM app.location_achievements a
    JOIN app.locations l ON l.id = a.location_id WHERE a.team_id = ${id} ORDER BY a.achieved_at`);
  const keys = await db.execute<{ name: string; acquired_at: Date }>(sql`
    SELECT k.name, t.acquired_at FROM app.team_cosmic_keys t
    JOIN app.cosmic_keys k ON k.id = t.key_id WHERE t.team_id = ${id} ORDER BY t.acquired_at`);
  const surprises = await db.execute<{
    title: string;
    discovered_at: Date;
    completed_at: Date | null;
  }>(sql`SELECT e.title, p.discovered_at, p.completed_at FROM app.surprise_progress p
    JOIN app.surprise_events e ON e.id = p.event_id WHERE p.team_id = ${id} ORDER BY p.discovered_at`);
  return {
    team,
    score,
    solved: [...solved],
    failed: [...failed],
    locations: [...locations],
    keys: [...keys],
    surprises: [...surprises],
  };
}
