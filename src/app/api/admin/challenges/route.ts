import { z } from 'zod';

import {
  challengeFields,
  flagTemplate,
  listChallenges,
  rethrowConflict,
} from '@/lib/admin/challenges';
import { actor, slugify } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { challengeHints, challenges } from '@/lib/db/schema';
import { json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

// A new challenge starts in team mode. /flag switches it to a static flag.
const body = z.object({ fields: challengeFields, flagTemplate });

export const GET = withAdmin(async () => json({ challenges: await listChallenges() }));

export const POST = withAdmin(async (req, session) => {
  const { fields, flagTemplate: template } = await parseBody(req, body);
  const { hints, ...values } = fields;

  const id = await db
    .transaction(async (tx) => {
      const [challenge] = await tx
        .insert(challenges)
        .values({
          ...values,
          slug: `${fields.number}-${slugify(fields.title)}`,
          flagMode: 'team',
          flagTemplate: template,
        })
        .returning({ id: challenges.id });
      if (hints.length > 0) {
        await tx.insert(challengeHints).values(
          hints.map((contentMd, i) => ({
            challengeId: challenge.id,
            hintOrder: i + 1,
            contentMd,
          })),
        );
      }
      await audit(tx, {
        ...actor(req, session),
        action: 'challenge.create',
        entityType: 'challenge',
        entityId: challenge.id,
        details: { number: fields.number },
      });
      return challenge.id;
    })
    .catch(rethrowConflict);

  return json({ id }, { status: 201 });
});
