import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { bumpBoard } from '@/lib/admin/event';
import { actor } from '@/lib/admin/http';
import { notifyBoard } from '@/lib/admin/notify';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { scoreTransactions, teams } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({
  teamId: z.uuid(),
  // Points are numeric(7,1): at most one decimal place. Sent to the database as text.
  points: z
    .number()
    .min(-10_000)
    .max(10_000)
    .refine((p) => p !== 0 && Math.abs(p * 10 - Math.round(p * 10)) < 1e-6),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withAdmin(async (req, session) => {
  const { teamId, points, reason } = await parseBody(req, body);

  const id = await db.transaction(async (tx) => {
    const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
    if (!team) throw new ApiError(404, 'not_found', 'Team not found.');
    const [row] = await tx
      .insert(scoreTransactions)
      .values({
        teamId,
        category: 'adjustment',
        points: points.toFixed(1),
        reason,
        adminId: session.userId,
      })
      .returning({ id: scoreTransactions.id });
    await bumpBoard(tx);
    await audit(tx, {
      ...actor(req, session),
      action: 'score.adjust',
      entityType: 'team',
      entityId: teamId,
      details: { points, reason },
    });
    return row.id;
  });

  await notifyBoard();
  return json({ id }, { status: 201 });
});
