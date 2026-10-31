import { and, eq, sql } from 'drizzle-orm';

import { NO_STORE, parseUuid } from '@/lib/admin/http';
import { db } from '@/lib/db/client';
import { challenges, teamChallengeVariants } from '@/lib/db/schema';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// shortcut: shows the team's stored variant, so unsaved edits don't appear. Use M4's renderer for
// a live preview once it is merged.
export const GET = withAdmin<{ id: string }>(async (req, _session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const teamId = parseUuid(req.nextUrl.searchParams.get('team'));

  const [variant] = await db
    .select({
      variantData: teamChallengeVariants.variantData,
      stale: sql<boolean>`${teamChallengeVariants.generatorVersion} < ${challenges.generatorVersion}`,
    })
    .from(teamChallengeVariants)
    .innerJoin(challenges, eq(challenges.id, teamChallengeVariants.challengeId))
    .where(
      and(eq(teamChallengeVariants.teamId, teamId), eq(teamChallengeVariants.challengeId, id)),
    );
  if (!variant)
    throw new ApiError(404, 'no_variant', 'This team has no variant yet. Regenerate first.');

  return json(variant, { headers: NO_STORE });
});
