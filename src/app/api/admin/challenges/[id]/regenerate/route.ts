import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { challenges } from '@/lib/db/schema';
import { ApiError, clientIp, json, withAdmin } from '@/lib/http';
import { regenerateVariants } from '@/lib/variants/regenerate';
import { TemplateError } from '@/lib/variants/render';

export const runtime = 'nodejs';

export const POST = withAdmin<{ id: string }>(async (req, session, { params }) => {
  const { success, data: id } = z.uuid().safeParse((await params).id);
  if (!success) throw new ApiError(404, 'not_found', 'No such challenge.');

  try {
    const count = await db.transaction(async (tx) => {
      const [challenge] = await tx
        .select({ id: challenges.id })
        .from(challenges)
        .where(eq(challenges.id, id));
      if (!challenge) throw new ApiError(404, 'not_found', 'No such challenge.');

      const regenerated = await regenerateVariants(tx, { challengeId: id });
      await audit(tx, {
        actorId: session.userId,
        action: 'challenge.regenerate_variants',
        entityType: 'challenge',
        entityId: id,
        details: { variants: regenerated },
        ip: clientIp(req),
      });
      return regenerated;
    });
    return json({ regenerated: count });
  } catch (e) {
    if (e instanceof TemplateError) throw new ApiError(422, 'bad_template', e.message);
    throw e;
  }
});
