import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { actor, parseLevel, pgError } from '@/lib/admin/http';
import { refreshVariants } from '@/lib/admin/locations';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { challenges, coordinateFragments, locations } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';
import { TemplateError } from '@/lib/variants/render';

export const runtime = 'nodejs';

const save = z.object({
  challengeId: z.uuid(),
  label: z.string().trim().min(1).max(20),
  value: z.string().trim().min(1).max(200),
  orderClue: z.string().trim().max(500).optional(),
});
const remove = z.object({ challengeId: z.uuid() });

function variantErrors(e: unknown): never {
  if (e instanceof TemplateError) throw new ApiError(422, 'bad_template', e.message);
  throw e;
}

// Maps a fragment to a challenge of this level (one per challenge, label unique per location).
export const POST = withAdmin<{ level: string }>(async (req, session, ctx) => {
  const level = parseLevel((await ctx.params).level);
  const input = await parseBody(req, save);

  await db
    .transaction(async (tx) => {
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.level, level));
      const [challenge] = await tx
        .select({ id: challenges.id, number: challenges.number, difficulty: challenges.difficulty })
        .from(challenges)
        .where(eq(challenges.id, input.challengeId));
      if (!location || !challenge) throw new ApiError(404, 'not_found', 'Not found.');
      if (challenge.difficulty !== level) {
        throw new ApiError(400, 'wrong_level', "That challenge isn't on this location's level.");
      }
      const values = { locationId: location.id, ...input };
      await tx
        .insert(coordinateFragments)
        .values(values)
        .onConflictDoUpdate({ target: coordinateFragments.challengeId, set: values });
      const regenerated = await refreshVariants(tx, challenge.id);
      await audit(tx, {
        ...actor(req, session),
        action: 'fragment.save',
        entityType: 'challenge',
        entityId: challenge.id,
        // The value is a coordinate piece, so it stays out of the log.
        details: { level, number: challenge.number, label: input.label, regenerated },
      });
    })
    .catch((e) => {
      if (pgError(e).code === '23505') {
        throw new ApiError(409, 'conflict', 'Another challenge here already uses that label.');
      }
      return variantErrors(e);
    });

  return json({ ok: true });
});

export const DELETE = withAdmin<{ level: string }>(async (req, session, ctx) => {
  const level = parseLevel((await ctx.params).level);
  const { challengeId } = await parseBody(req, remove);

  await db
    .transaction(async (tx) => {
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.level, level));
      const [gone] = await tx
        .delete(coordinateFragments)
        .where(
          and(
            eq(coordinateFragments.challengeId, challengeId),
            eq(coordinateFragments.locationId, location.id),
          ),
        )
        .returning({ id: coordinateFragments.id });
      if (!gone) throw new ApiError(404, 'not_found', 'Not found.');
      const regenerated = await refreshVariants(tx, challengeId);
      await audit(tx, {
        ...actor(req, session),
        action: 'fragment.delete',
        entityType: 'challenge',
        entityId: challengeId,
        details: { level, regenerated },
      });
    })
    .catch(variantErrors);

  return json({ ok: true });
});
