import { eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { z } from 'zod';

import { checkFragmentPlan, fragmentPlan } from '@/lib/admin/coordinates';
import { actor } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { challenges } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';
import { regenerateVariants } from '@/lib/variants/regenerate';
import { TemplateError } from '@/lib/variants/render';

export const runtime = 'nodejs';

// Replaces the whole fragment plan: exactly six questions (2 Easy, 2 Medium, 2 Difficult) with
// orders 1-6, or an empty list to clear. A flag can embed its fragment, so the touched questions'
// variants are regenerated in the same transaction.
export const POST = withAdmin(async (req, session) => {
  const { plan } = await parseBody(req, z.object({ plan: fragmentPlan }));

  await db
    .transaction(async (tx) => {
      const rows = await tx
        .select({ id: challenges.id, difficulty: challenges.difficulty })
        .from(challenges)
        .where(
          plan.length > 0
            ? inArray(
                challenges.id,
                plan.map((p) => p.challengeId),
              )
            : undefined,
        );
      const error = checkFragmentPlan(plan, new Map(rows.map((r) => [r.id, r.difficulty])));
      if (error) throw new ApiError(400, 'bad_fragments', error);

      const previous = await tx
        .select({ id: challenges.id })
        .from(challenges)
        .where(isNotNull(challenges.fragmentValue));
      // Cleared first, so reordering never trips the unique order index.
      await tx
        .update(challenges)
        .set({ fragmentValue: null, coordinateOrder: null, orderClue: null })
        .where(isNotNull(challenges.fragmentValue));
      for (const p of plan) {
        await tx
          .update(challenges)
          .set({
            fragmentValue: p.value,
            coordinateOrder: p.order,
            orderClue: p.orderClue || null,
          })
          .where(eq(challenges.id, p.challengeId));
      }
      const touched = [
        ...new Set([...previous.map((r) => r.id), ...plan.map((p) => p.challengeId)]),
      ];
      for (const id of touched) {
        await tx
          .update(challenges)
          .set({ generatorVersion: sql`${challenges.generatorVersion} + 1` })
          .where(eq(challenges.id, id));
        await regenerateVariants(tx, { challengeId: id });
      }
      await audit(tx, {
        ...actor(req, session),
        action: 'fragments.save',
        entityType: 'challenge',
        // Counts only: values and the real order are secrets.
        details: { assigned: plan.length, regenerated: touched.length },
      });
    })
    .catch((e) => {
      if (e instanceof TemplateError) throw new ApiError(422, 'bad_template', e.message);
      throw e;
    });

  return json({ ok: true });
});
