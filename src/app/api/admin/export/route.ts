import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { toCsv } from '@/lib/admin/csv';
import { db } from '@/lib/db/client';
import { vScoreboard } from '@/lib/db/schema';
import { ApiError, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const kind = z.enum(['leaderboard', 'results']);

function csvResponse(csv: string, name: string) {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

// Totals and the ledger only: no flags, hashes, answers or passwords.
export const GET = withAdmin(async (req) => {
  const parsed = kind.safeParse(req.nextUrl.searchParams.get('kind'));
  if (!parsed.success)
    throw new ApiError(400, 'bad_request', 'kind must be leaderboard or results.');

  if (parsed.data === 'leaderboard') {
    const rows = await db
      .select()
      .from(vScoreboard)
      .orderBy(vScoreboard.rankAll, vScoreboard.teamName);
    return csvResponse(
      toCsv([
        [
          'rank',
          'team',
          'hidden',
          'total',
          'challenge',
          'surprise',
          'adjustment',
          'solves',
          'easy',
          'medium',
          'difficult',
          'main_solved',
          'coordinates_found',
          'surprises',
        ],
        ...rows.map((r) => [
          String(r.rankAll),
          r.teamName,
          r.isHidden ? 'yes' : 'no',
          r.total,
          r.challengePoints,
          r.surprisePoints,
          r.adjustmentPoints,
          String(r.solves),
          String(r.easySolved),
          String(r.mediumSolved),
          String(r.difficultSolved),
          r.mainSolvedAt ? r.mainSolvedAt.toISOString() : '',
          r.coordinatesFoundAt ? r.coordinatesFoundAt.toISOString() : '',
          String(r.surprises),
        ]),
      ]),
      'leaderboard',
    );
  }

  const rows = await db.execute<{
    team: string;
    category: string;
    points: string;
    reason: string | null;
    at: Date;
  }>(sql`SELECT t.name AS team, l.category, l.points, l.reason, l.created_at AS at
    FROM app.score_transactions l JOIN app.teams t ON t.id = l.team_id
    ORDER BY l.created_at, l.id`);
  return csvResponse(
    toCsv([
      ['time', 'team', 'category', 'points', 'reason'],
      ...rows.map((r) => [
        new Date(r.at).toISOString(),
        r.team,
        r.category,
        r.points,
        r.reason ?? '',
      ]),
    ]),
    'results',
  );
});
