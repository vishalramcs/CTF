import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  challenges,
  cosmicKeys,
  locationAchievements,
  locations,
  teamCosmicKeys,
  vTeamFragments,
} from '@/lib/db/schema';

// Explicit columns: answer hashes and unearned fragments never get loaded. The view holds only
// fragments of challenges the team solved. The level enum sorts easy to main_difficult.
export async function listLocations(teamId: string) {
  const rows = await db
    .select({
      id: locations.id,
      level: locations.level,
      name: locations.name,
      rewardPoints: locations.rewardPoints,
      fragmentsRequired: locations.fragmentsRequired,
      achievedAt: locationAchievements.achievedAt,
      keyName: cosmicKeys.name,
      keyAcquiredAt: teamCosmicKeys.acquiredAt,
    })
    .from(locations)
    .innerJoin(cosmicKeys, eq(cosmicKeys.level, locations.level))
    .leftJoin(
      locationAchievements,
      and(
        eq(locationAchievements.locationId, locations.id),
        eq(locationAchievements.teamId, teamId),
      ),
    )
    .leftJoin(
      teamCosmicKeys,
      and(eq(teamCosmicKeys.keyId, cosmicKeys.id), eq(teamCosmicKeys.teamId, teamId)),
    )
    .orderBy(asc(locations.level));

  const earned = await db
    .select({
      locationId: vTeamFragments.locationId,
      label: vTeamFragments.label,
      value: vTeamFragments.value,
      orderClue: vTeamFragments.orderClue,
      challengeNumber: challenges.number,
    })
    .from(vTeamFragments)
    .innerJoin(challenges, eq(challenges.id, vTeamFragments.challengeId))
    .where(eq(vTeamFragments.teamId, teamId))
    .orderBy(asc(challenges.number));

  return rows.map((row) => {
    const fragments = earned
      .filter((fragment) => fragment.locationId === row.id)
      .map(({ label, value, orderClue, challengeNumber }) => ({
        label,
        value,
        orderClue,
        challengeNumber,
      }));
    return {
      level: row.level,
      name: row.name,
      rewardPoints: Number(row.rewardPoints),
      fragmentsRequired: row.fragmentsRequired,
      fragments,
      unlocked: fragments.length >= row.fragmentsRequired,
      completed: row.achievedAt !== null,
      achievedAt: row.achievedAt,
      key: row.keyAcquiredAt ? { name: row.keyName, acquiredAt: row.keyAcquiredAt } : null,
    };
  });
}
