import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { actor, parseUuid, pgError } from '@/lib/admin/http';
import { notifyBoard } from '@/lib/admin/notify';
import { loadTeamDetail, revokeTeamSessions } from '@/lib/admin/teams';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import { db } from '@/lib/db/client';
import { teams, users } from '@/lib/db/schema';
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
  // A rename moves the login too: the username is the team name and the password is derived from
  // it. Hashed before the transaction, which holds the instance's only connection.
  const passwordHash = changes.name ? await hashPassword(teamPassword(changes.name)) : undefined;

  await db
    .transaction(async (tx) => {
      const [team] = await tx
        .update(teams)
        .set(changes)
        .where(eq(teams.id, id))
        .returning({ id: teams.id });
      if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
      // Revoked, not just blocked, so reactivating the team doesn't bring old devices back.
      let revokedSessions =
        changes.isActive === false ? await revokeTeamSessions(tx, id, 'team_disabled') : 0;
      if (changes.name && passwordHash) {
        await tx
          .update(users)
          .set({ username: changes.name, passwordHash, passwordChangedAt: sql`now()` })
          .where(eq(users.teamId, id));
        revokedSessions += await revokeTeamSessions(tx, id, 'password_reset');
      }
      await audit(tx, {
        ...actor(req, session),
        action: 'team.update',
        entityType: 'team',
        entityId: id,
        details: { ...changes, revokedSessions },
      });
    })
    .catch((e) => {
      const constraint = pgError(e).constraint_name;
      if (constraint === 'teams_name_uq' || constraint === 'users_username_uq') {
        throw new ApiError(409, 'conflict', 'Another team or login has that name.');
      }
      throw e;
    });

  // Name, hidden and active all change what the board shows.
  await notifyBoard();
  return json({ ok: true });
});

// Permanent. The team's login, sessions, solves, submissions and score rows go with it (every
// table references teams ON DELETE CASCADE). Other teams keep the points they were awarded.
export const DELETE = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  await db.transaction(async (tx) => {
    const [team] = await tx
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, id))
      .for('update');
    if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
    await tx.execute(sql`UPDATE app.event_state SET coordinate_winner_id = NULL,
      coordinate_won_at = NULL WHERE coordinate_winner_id = ${id}`);
    await tx.delete(teams).where(eq(teams.id, id));
    await audit(tx, {
      ...actor(req, session),
      action: 'team.delete',
      entityType: 'team',
      entityId: id,
      details: { name: team.name },
    });
  });
  await notifyBoard();
  return json({ ok: true });
});
