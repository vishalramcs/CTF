import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  challenges,
  locationAchievements,
  locations,
  solves,
  submissions,
  surpriseEvents,
  surpriseProgress,
} from '@/lib/db/schema';

export type HistoryEntry =
  | {
      type: 'challenge';
      at: string;
      title: string;
      points: number;
      position: number;
      number: number;
    }
  | { type: 'location'; at: string; title: string; points: number }
  | { type: 'surprise'; at: string; title: string; points: number };

export type SurpriseDone = { kind: string; title: string; points: number; at: string };

// This team's completed surprises. Titles are given only once the team has completed them.
export async function listCompletedSurprises(teamId: string): Promise<SurpriseDone[]> {
  const rows = await db
    .select({
      kind: surpriseEvents.kind,
      title: surpriseEvents.title,
      points: surpriseEvents.points,
      at: surpriseProgress.completedAt,
    })
    .from(surpriseProgress)
    .innerJoin(surpriseEvents, eq(surpriseEvents.id, surpriseProgress.eventId))
    .where(eq(surpriseProgress.teamId, teamId));
  return rows.flatMap((r) =>
    r.at
      ? [{ kind: r.kind, title: r.title, points: Number(r.points), at: r.at.toISOString() }]
      : [],
  );
}

// Counts only: submitted text and hashes never leave the database. Queries run one at a time.
export async function getTeamHistory(teamId: string) {
  const solved = await db
    .select({
      number: challenges.number,
      title: challenges.title,
      points: solves.pointsAwarded,
      position: solves.solvePosition,
      at: solves.solvedAt,
    })
    .from(solves)
    .innerJoin(challenges, eq(challenges.id, solves.challengeId))
    .where(eq(solves.teamId, teamId));

  const wrong = await db
    .select({
      number: challenges.number,
      title: challenges.title,
      count: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .innerJoin(challenges, eq(challenges.id, submissions.challengeId))
    .where(sql`${submissions.teamId} = ${teamId} AND NOT ${submissions.isCorrect}`)
    .groupBy(challenges.number, challenges.title)
    .orderBy(asc(challenges.number));

  const found = await db
    .select({
      title: locations.name,
      points: locations.rewardPoints,
      at: locationAchievements.achievedAt,
    })
    .from(locationAchievements)
    .innerJoin(locations, eq(locations.id, locationAchievements.locationId))
    .where(eq(locationAchievements.teamId, teamId));

  const surprises = await listCompletedSurprises(teamId);

  const entries: HistoryEntry[] = [
    ...solved.map((r) => ({
      type: 'challenge' as const,
      at: r.at.toISOString(),
      title: r.title,
      points: Number(r.points),
      position: r.position,
      number: r.number,
    })),
    ...found.map((r) => ({
      type: 'location' as const,
      at: r.at.toISOString(),
      title: r.title,
      points: Number(r.points),
    })),
    ...surprises.map((s) => ({
      type: 'surprise' as const,
      at: s.at,
      title: s.title,
      points: s.points,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return { entries, wrongAttempts: wrong };
}
