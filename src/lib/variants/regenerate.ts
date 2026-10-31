import { eq, sql } from 'drizzle-orm';

import type { db } from '@/lib/db/client';
import { challenges, coordinateFragments, teamChallengeVariants, teams } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { buildVariant } from '@/lib/variants/derive';

// 05 §5: idempotent upsert, and solves are never touched. Call after creating a team (teamId) or
// changing a challenge (challengeId). A bad template throws TemplateError and writes nothing.
export async function regenerateVariants(
  executor: Pick<typeof db, 'select' | 'insert'>,
  { challengeId, teamId }: { challengeId?: string; teamId?: string },
): Promise<number> {
  const teamRows = await executor
    .select({ id: teams.id })
    .from(teams)
    .where(teamId ? eq(teams.id, teamId) : undefined);
  const challengeRows = await executor
    .select()
    .from(challenges)
    .where(challengeId ? eq(challenges.id, challengeId) : undefined);

  // Fragments come from the mapping, so a fragment is the same for every team (docs/07 §4).
  const fragmentRows = await executor
    .select({ challengeId: coordinateFragments.challengeId, value: coordinateFragments.value })
    .from(coordinateFragments);
  const fragments = new Map(fragmentRows.map((f) => [f.challengeId, f.value]));

  const keys = {
    variantKey: env.VARIANT_HMAC_KEY,
    flagKey: env.FLAG_HMAC_KEY,
    flagPrefix: env.FLAG_PREFIX,
  };
  const rows = teamRows.flatMap((team) =>
    challengeRows.map((challenge) => {
      const { variantData, expectedFlagHash } = buildVariant(
        team.id,
        { ...challenge, fragmentValue: fragments.get(challenge.id) ?? null },
        keys,
      );
      return {
        teamId: team.id,
        challengeId: challenge.id,
        variantData,
        expectedFlagHash,
        generatorVersion: challenge.generatorVersion,
      };
    }),
  );
  if (rows.length === 0) return 0;

  await executor
    .insert(teamChallengeVariants)
    .values(rows)
    .onConflictDoUpdate({
      target: [teamChallengeVariants.teamId, teamChallengeVariants.challengeId],
      set: {
        variantData: sql`excluded.variant_data`,
        expectedFlagHash: sql`excluded.expected_flag_hash`,
        generatorVersion: sql`excluded.generator_version`,
      },
    });
  return rows.length;
}
