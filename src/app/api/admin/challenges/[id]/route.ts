import { count, eq } from 'drizzle-orm';

import { challengePatch, loadChallenge, rethrowConflict } from '@/lib/admin/challenges';
import { actor, parseUuid } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { challengeHints, challenges, solves } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// Anything a variant is rendered from makes the stored variants stale.
const VARIANT_INPUTS = ['questionTemplate', 'evidence', 'generatorKey', 'generatorConfig'];

export const GET = withAdmin<{ id: string }>(async (_req, _session, ctx) => {
  const challenge = await loadChallenge(parseUuid((await ctx.params).id));
  if (!challenge) throw new ApiError(404, 'not_found', 'Challenge not found.');
  return json({ challenge });
});

export const PATCH = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);
  const { hints, ...values } = await parseBody(req, challengePatch);

  const generatorVersion = await db
    .transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, id))
        .for('update');
      if (!existing) throw new ApiError(404, 'not_found', 'Challenge not found.');

      const changed = (Object.keys(values) as (keyof typeof values)[]).filter(
        (key) => JSON.stringify(values[key]) !== JSON.stringify(existing[key]),
      );
      const stale = changed.some((key) => VARIANT_INPUTS.includes(key));
      const version = existing.generatorVersion + (stale ? 1 : 0);

      if (Object.keys(values).length > 0) {
        await tx
          .update(challenges)
          .set({ ...values, generatorVersion: version })
          .where(eq(challenges.id, id));
      }
      if (hints) {
        await tx.delete(challengeHints).where(eq(challengeHints.challengeId, id));
        if (hints.length > 0) {
          await tx
            .insert(challengeHints)
            .values(
              hints.map((contentMd, i) => ({ challengeId: id, hintOrder: i + 1, contentMd })),
            );
        }
      }

      await audit(tx, {
        ...actor(req, session),
        action: 'challenge.update',
        entityType: 'challenge',
        entityId: id,
        // Field names only: values can hold clues.
        details: {
          number: existing.number,
          changed: hints ? [...changed, 'hints'] : changed,
          generatorVersion: version,
        },
      });
      return version;
    })
    .catch(rethrowConflict);

  return json({ generatorVersion });
});

export const DELETE = withAdmin<{ id: string }>(async (req, session, ctx) => {
  const id = parseUuid((await ctx.params).id);

  await db.transaction(async (tx) => {
    const [challenge] = await tx
      .select({ number: challenges.number })
      .from(challenges)
      .where(eq(challenges.id, id))
      .for('update');
    if (!challenge) throw new ApiError(404, 'not_found', 'Challenge not found.');

    // Deleting cascades to solves, which would silently take points off the board.
    const [{ solved }] = await tx
      .select({ solved: count() })
      .from(solves)
      .where(eq(solves.challengeId, id));
    if (solved > 0) {
      throw new ApiError(
        409,
        'conflict',
        'Teams have solved this challenge. Unpublish it instead.',
      );
    }

    await tx.delete(challenges).where(eq(challenges.id, id));
    await audit(tx, {
      ...actor(req, session),
      action: 'challenge.delete',
      entityType: 'challenge',
      entityId: id,
      details: { number: challenge.number },
    });
  });

  return json({ ok: true });
});
