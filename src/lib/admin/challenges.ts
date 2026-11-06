import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { pgError } from '@/lib/admin/http';
import { GENERATOR_KEYS, LEVELS } from '@/lib/admin/shared';
import { db } from '@/lib/db/client';
import { challengeHints, challenges } from '@/lib/db/schema';
import { ApiError } from '@/lib/http';
import { WORKSPACES } from '@/lib/workspace/definitions';

export const WORKSPACE_NAMES = Object.keys(WORKSPACES);

// Everything an admin needs, and never static_flag_hash.
const columns = {
  id: challenges.id,
  number: challenges.number,
  slug: challenges.slug,
  title: challenges.title,
  difficulty: challenges.difficulty,
  category: challenges.category,
  basePoints: challenges.basePoints,
  storyMd: challenges.storyMd,
  questionTemplate: challenges.questionTemplate,
  evidence: challenges.evidence,
  generatorKey: challenges.generatorKey,
  generatorConfig: challenges.generatorConfig,
  generatorVersion: challenges.generatorVersion,
  flagMode: challenges.flagMode,
  flagTemplate: challenges.flagTemplate,
  isPublished: challenges.isPublished,
};

export function listChallenges() {
  return db.select(columns).from(challenges).orderBy(challenges.number);
}

// Which fragment slot (1-6) each question holds, by challenge id. The value itself stays out.
export async function fragmentSlots(): Promise<Record<string, number>> {
  const rows = await db
    .select({ id: challenges.id, slot: challenges.coordinateOrder })
    .from(challenges);
  return Object.fromEntries(rows.flatMap((r) => (r.slot === null ? [] : [[r.id, r.slot]])));
}

export async function loadChallenge(id: string) {
  const [challenge] = await db.select(columns).from(challenges).where(eq(challenges.id, id));
  if (!challenge) return undefined;
  const hints = await db
    .select({ contentMd: challengeHints.contentMd })
    .from(challengeHints)
    .where(eq(challengeHints.challengeId, id))
    .orderBy(asc(challengeHints.hintOrder));
  return { ...challenge, hints: hints.map((h) => h.contentMd) };
}

export type LoadedChallenge = NonNullable<Awaited<ReturnType<typeof loadChallenge>>>;

export const challengeFields = z.object({
  number: z.number().int().min(1).max(13),
  title: z.string().trim().min(1).max(120),
  difficulty: z.enum(LEVELS),
  category: z.string().trim().min(1).max(40),
  basePoints: z.number().int().min(1).max(100_000),
  storyMd: z.string().max(20_000),
  questionTemplate: z.string().max(200_000),
  evidence: z.array(z.unknown()).max(100),
  generatorKey: z.enum(GENERATOR_KEYS),
  // Holds the template's `inspect` and `files` blocks (QUESTIONS_TEMPLATE §4–5).
  generatorConfig: z
    .record(z.string(), z.unknown())
    .refine((c) => c.workspace === undefined || WORKSPACE_NAMES.includes(c.workspace as string), {
      message: 'Unknown workspace.',
    }),
  hints: z.array(z.string().trim().min(1).max(5000)).max(20),
  isPublished: z.boolean(),
});

// PATCH takes any subset, so a list row can flip `isPublished` without sending the whole form.
export const challengePatch = challengeFields.partial().refine((c) => Object.keys(c).length > 0);

export const flagTemplate = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((t) => t.includes('{{token}}'), 'The template must contain {{token}}.');

// Turns the schema's unique indexes into a message the admin can act on. Rethrows anything else.
export function rethrowConflict(e: unknown): never {
  const { code, constraint_name: constraint } = pgError(e);
  if (code === '23505') {
    if (constraint === 'challenges_number_key') {
      throw new ApiError(409, 'conflict', 'Another challenge uses that number.');
    }
    if (constraint === 'challenges_slug_key') {
      throw new ApiError(409, 'conflict', 'Another challenge has that slug. Change the title.');
    }
  }
  if (code === '23505' && constraint === 'challenges_one_main_uq') {
    throw new ApiError(409, 'conflict', 'There is already a Main Question.');
  }
  if (code === '23514' && constraint === 'challenges_no_main_fragment') {
    throw new ApiError(409, 'conflict', 'Remove this question from the fragment plan first.');
  }
  throw e;
}
