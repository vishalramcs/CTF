import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { actor, parseUuid } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { challenges, teamChallengeVariants } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalizeFlag } from '@/lib/flags/normalize';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ teamId: z.uuid(), flag: z.string().max(300) });

// App Flow §4.3: checks against what a real submit would use, without logging a submission.
export const POST = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const { teamId, flag } = await parseBody(req, body);

  const [variant] = await db
    .select({
      expectedFlagHash: teamChallengeVariants.expectedFlagHash,
      stale: sql<boolean>`${teamChallengeVariants.generatorVersion} < ${challenges.generatorVersion}`,
    })
    .from(teamChallengeVariants)
    .innerJoin(challenges, eq(challenges.id, teamChallengeVariants.challengeId))
    .where(
      and(eq(teamChallengeVariants.teamId, teamId), eq(teamChallengeVariants.challengeId, id)),
    );
  if (!variant) {
    throw new ApiError(409, 'no_variant', 'This team has no variant yet. Regenerate first.');
  }

  const normalized = normalizeFlag(flag, env.FLAG_PREFIX);
  const match = normalized
    ? safeEqual(hmacHex(env.FLAG_HMAC_KEY, normalized), variant.expectedFlagHash)
    : false;

  await audit(db, {
    ...actor(req, session),
    action: 'challenge.test_flag',
    entityType: 'challenge',
    entityId: id,
    details: { teamId, match },
  });

  return json({ match, malformed: !normalized, stale: variant.stale });
});
