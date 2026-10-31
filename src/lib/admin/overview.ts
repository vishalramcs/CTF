import { sql } from 'drizzle-orm';

import { loadEventState } from '@/lib/admin/event';
import { db } from '@/lib/db/client';
import { vScoreboard } from '@/lib/db/schema';

// Run one after another: the app has one pooled connection.
export async function loadOverview() {
  const event = await loadEventState();
  const [counts] = await db.execute<{
    teams: number;
    active_teams: number;
    online_teams: number;
    hidden_teams: number;
    solves: number;
    coordinates: number;
    surprises: number;
  }>(sql`SELECT
    (SELECT count(*) FROM app.teams)::int AS teams,
    (SELECT count(*) FROM app.teams WHERE is_active)::int AS active_teams,
    (SELECT count(DISTINCT team_id) FROM app.sessions
       WHERE team_id IS NOT NULL AND revoked_at IS NULL AND expires_at > now()
         AND last_seen_at > now() - interval '5 minutes')::int AS online_teams,
    (SELECT count(*) FROM app.teams WHERE is_hidden)::int AS hidden_teams,
    (SELECT count(*) FROM app.solves)::int AS solves,
    (SELECT count(*) FROM app.coordinate_submissions WHERE is_correct)::int AS coordinates,
    (SELECT count(*) FROM app.surprise_progress WHERE completed_at IS NOT NULL)::int AS surprises`);
  // Admins see hidden and inactive teams too, marked as such.
  const board = await db
    .select()
    .from(vScoreboard)
    .orderBy(vScoreboard.rankAll, vScoreboard.teamName);
  return {
    event,
    counts: {
      teams: counts.teams,
      activeTeams: counts.active_teams,
      onlineTeams: counts.online_teams,
      hiddenTeams: counts.hidden_teams,
      solves: counts.solves,
      coordinatesFound: counts.coordinates,
      surpriseCompletions: counts.surprises,
    },
    board,
  };
}

export type Overview = Awaited<ReturnType<typeof loadOverview>>;
