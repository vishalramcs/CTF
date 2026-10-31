import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { actor, parseUuid, pgError } from '@/lib/admin/http';
import { notifyBoard } from '@/lib/admin/notify';
import { loadTeamDetail, revokeTeamSessions } from '@/lib/admin/teams';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { teams } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    isActive: z.boolean().optional(),
    isHidden: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0);

export const GET = withAdmin<{ id: string }>(async (_req, _session, ctx) => {
  const detail = await loadTeamDetail(parseUuid((await ctx.params).id));
  if (!detail) throw new ApiError(404, 'not_found', 'Team not found.');
  return json(detail);
});

export const PATCH = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const changes = await parseBody(req, body);

  await db
    .transaction(async (tx) => {
      const [team] = await tx
        .update(teams)
        .set(changes)
        .where(eq(teams.id, id))
        .returning({ id: teams.id });
      if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
      // Revoked, not just blocked, so reactivating the team doesn't bring old devices back.
      const revokedSessions =
        changes.isActive === false ? await revokeTeamSessions(tx, id, 'team_disabled') : 0;
      await audit(tx, {
        ...actor(req, session),
        action: 'team.update',
        entityType: 'team',
        entityId: id,
        details: { ...changes, revokedSessions },
      });
    })
    .catch((e) => {
      if (pgError(e).constraint_name === 'teams_name_uq') {
        throw new ApiError(409, 'conflict', 'Another team has that name.');
      }
      throw e;
    });

  // Name, hidden and active all change what the board shows.
  await notifyBoard();
  return json({ ok: true });
});
