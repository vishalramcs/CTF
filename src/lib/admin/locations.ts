import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { challenges, coordinateFragments, locations } from '@/lib/db/schema';
import { regenerateVariants } from '@/lib/variants/regenerate';

import type { Tx } from './event';

// Never selects answer_hash or answer_enc: the form only learns whether an answer is set.
export async function loadLocations() {
  const rows = await db
    .select({
      id: locations.id,
      level: locations.level,
      name: locations.name,
      hasAnswer: locations.answerHash,
      rewardPoints: locations.rewardPoints,
      fragmentsRequired: locations.fragmentsRequired,
    })
    .from(locations);
  const fragments = await db
    .select({
      id: coordinateFragments.id,
      locationId: coordinateFragments.locationId,
      challengeId: coordinateFragments.challengeId,
      challengeNumber: challenges.number,
      challengeTitle: challenges.title,
      label: coordinateFragments.label,
      value: coordinateFragments.value,
      orderClue: coordinateFragments.orderClue,
    })
    .from(coordinateFragments)
    .innerJoin(challenges, eq(challenges.id, coordinateFragments.challengeId))
    .orderBy(challenges.number);
  const candidates = await db
    .select({
      id: challenges.id,
      number: challenges.number,
      title: challenges.title,
      difficulty: challenges.difficulty,
    })
    .from(challenges)
    .orderBy(challenges.number);
  return rows.map(({ hasAnswer, rewardPoints, ...row }) => ({
    ...row,
    hasAnswer: hasAnswer !== null,
    rewardPoints: Number(rewardPoints),
    fragments: fragments.filter((f) => f.locationId === row.id),
    challenges: candidates.filter((c) => c.difficulty === row.level),
  }));
}

// A flag can embed its fragment, so a mapping change makes the challenge's variants stale.
export async function refreshVariants(tx: Tx, challengeId: string) {
  await tx
    .update(challenges)
    .set({ generatorVersion: sql`${challenges.generatorVersion} + 1` })
    .where(eq(challenges.id, challengeId));
  return regenerateVariants(tx, { challengeId });
}
