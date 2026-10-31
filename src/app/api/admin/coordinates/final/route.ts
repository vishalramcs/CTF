import { z } from 'zod';

import { actor } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { finalCoordinates } from '@/lib/db/schema';
import { json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({
  coordinates: z
    .array(
      z.object({
        label: z.string().trim().max(40),
        value: z.string().trim().min(1).max(60),
      }),
    )
    .length(3),
});

// The three coordinates a Main Question solve unlocks. Values stay out of the audit log.
export const POST = withAdmin(async (req, session) => {
  const { coordinates } = await parseBody(req, body);

  await db.transaction(async (tx) => {
    await tx.delete(finalCoordinates);
    await tx
      .insert(finalCoordinates)
      .values(coordinates.map((c, i) => ({ position: i + 1, ...c })));
    await audit(tx, {
      ...actor(req, session),
      action: 'final_coordinates.save',
      entityType: 'event',
      details: { count: coordinates.length },
    });
  });

  return json({ ok: true });
});
