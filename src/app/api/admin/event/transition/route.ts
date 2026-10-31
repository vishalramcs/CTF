import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { lockEvent } from '@/lib/admin/event';
import { actor } from '@/lib/admin/http';
import { notifyStatus } from '@/lib/admin/notify';
import { TRANSITIONS } from '@/lib/admin/shared';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({ action: z.enum(['start', 'pause', 'resume', 'end']) });

export const POST = withAdmin(async (req, session) => {
  const { action } = await parseBody(req, body);
  const { from, to } = TRANSITIONS[action];

  const previous = await db.transaction(async (tx) => {
    const state = await lockEvent(tx);
    if (!(from as readonly string[]).includes(state.status)) {
      throw new ApiError(
        409,
        'invalid_transition',
        `Can't ${action} while the event is ${state.status}.`,
      );
    }
    await tx
      .update(eventState)
      .set({ status: to, statusChangedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(eventState.id, 1));
    await audit(tx, {
      ...actor(req, session),
      action: `event.${action}`,
      entityType: 'event',
      details: { from: state.status, to },
    });
    return state.status;
  });

  await notifyStatus();
  return json({ from: previous, status: to });
});
