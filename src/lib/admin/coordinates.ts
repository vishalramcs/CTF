import { asc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { challenges, eventState, finalCoordinates, teams } from '@/lib/db/schema';

export const fragmentPlan = z
  .array(
    z.object({
      challengeId: z.uuid(),
      value: z.string().trim().min(1).max(60),
      order: z.number().int().min(1).max(6),
      orderClue: z.string().trim().max(300).nullable().optional(),
    }),
  )
  .max(6);

export type FragmentPlan = z.infer<typeof fragmentPlan>;

// docs/11. A plan is empty (clears every fragment) or exactly six: two per difficulty, never on the
// Main Question, slots 1-6 each used once (1 L1-N, 2 L1-S, 3 L2-N, 4 L2-S, 5 L3-N, 6 L3-S). Which
// question holds which slot is free, so a location can mix difficulties. A table check can't count
// rows, so it is here.
export function checkFragmentPlan(
  plan: { challengeId: string; order: number }[],
  difficultyOf: Map<string, string>,
): string | null {
  if (plan.length === 0) return null;
  if (plan.length !== 6) return 'Assign exactly 6 fragments, or none.';
  if (new Set(plan.map((p) => p.challengeId)).size !== 6) return 'A question appears twice.';
  if (new Set(plan.map((p) => p.order)).size !== 6) return 'Each order from 1 to 6 is used once.';
  const counts: Record<string, number> = {};
  for (const p of plan) {
    const difficulty = difficultyOf.get(p.challengeId);
    if (!difficulty) return 'Unknown question.';
    counts[difficulty] = (counts[difficulty] ?? 0) + 1;
  }
  if (counts.main_difficult) return 'The Main Question cannot carry a fragment.';
  if (counts.easy !== 2 || counts.medium !== 2 || counts.difficult !== 2) {
    return 'Use 2 Easy, 2 Medium and 2 Difficult questions.';
  }
  return null;
}

// Never selects answer_hash or answer_enc: the page only learns whether an answer is set.
export async function loadCoordinateConfig() {
  const [state] = await db
    .select({
      hasAnswer: eventState.coordinateAnswerHash,
      answerCount: sql<number>`cardinality(${eventState.coordinateAnswerAltHashes})`,
      finalSignal: eventState.finalSignal,
      finalPoints: eventState.finalPoints,
      winnerId: eventState.coordinateWinnerId,
      wonAt: eventState.coordinateWonAt,
      winnerName: teams.name,
    })
    .from(eventState)
    .leftJoin(teams, eq(teams.id, eventState.coordinateWinnerId));
  const questions = await db
    .select({
      id: challenges.id,
      number: challenges.number,
      title: challenges.title,
      difficulty: challenges.difficulty,
      fragmentValue: challenges.fragmentValue,
      coordinateOrder: challenges.coordinateOrder,
      orderClue: challenges.orderClue,
    })
    .from(challenges)
    .where(ne(challenges.difficulty, 'main_difficult'))
    .orderBy(asc(challenges.number));
  const final = await db
    .select({
      position: finalCoordinates.position,
      label: finalCoordinates.label,
      value: finalCoordinates.value,
    })
    .from(finalCoordinates)
    .orderBy(asc(finalCoordinates.position));
  const [mainFirst] = await db.execute<{ team: string; at: Date }>(sql`
    SELECT t.name AS team, s.solved_at AS at
      FROM app.solves s
      JOIN app.challenges c ON c.id = s.challenge_id AND c.difficulty = 'main_difficult'
      JOIN app.teams t ON t.id = s.team_id
     WHERE s.solve_position = 1`);
  const assigned = questions.filter((q) => q.fragmentValue !== null);
  return {
    hasAnswer: state.hasAnswer !== null,
    answerCount: Number(state.answerCount),
    finalSignal: state.finalSignal ?? '',
    finalPoints: Number(state.finalPoints),
    winner: state.winnerName ? { team: state.winnerName, at: state.wonAt } : null,
    mainFirst: mainFirst ? { team: mainFirst.team, at: mainFirst.at } : null,
    questions,
    final,
    planError: checkFragmentPlan(
      assigned.map((q) => ({ challengeId: q.id, order: q.coordinateOrder! })),
      new Map(questions.map((q) => [q.id, q.difficulty])),
    ),
    assignedCount: assigned.length,
  };
}

export type CoordinateConfig = Awaited<ReturnType<typeof loadCoordinateConfig>>;

// Per question: every solve in order, with the points the database awarded. Scores come from solves.
export async function loadSolveOrder() {
  const questions = await db
    .select({
      id: challenges.id,
      number: challenges.number,
      title: challenges.title,
      difficulty: challenges.difficulty,
      basePoints: challenges.basePoints,
      isPublished: challenges.isPublished,
    })
    .from(challenges)
    .orderBy(asc(challenges.number));
  const rows = await db.execute<{
    challenge_id: string;
    team: string;
    position: number;
    points: string;
    at: Date;
  }>(sql`SELECT s.challenge_id, t.name AS team, s.solve_position AS position,
                s.points_awarded AS points, s.solved_at AS at
    FROM app.solves s JOIN app.teams t ON t.id = s.team_id
    ORDER BY s.challenge_id, s.solve_position`);
  return questions.map((q) => ({
    ...q,
    solves: rows
      .filter((r) => r.challenge_id === q.id)
      .map((r) => ({ team: r.team, position: r.position, points: r.points, at: r.at })),
  }));
}

export type SolveOrder = Awaited<ReturnType<typeof loadSolveOrder>>;
