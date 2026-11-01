import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  challenges,
  coordinateSubmissions,
  finalCoordinates,
  fragmentClaims,
  solves,
} from '@/lib/db/schema';

export const FRAGMENT_SLOTS = 6;

export type FinalCoordinate = { label: string; value: string };

// The three final coordinates, only for a team that solved the Main Question. Takes the caller's
// executor so a submit can read them inside its own transaction.
export async function finalCoordinatesFor(
  executor: Pick<typeof db, 'select'>,
  teamId: string,
): Promise<FinalCoordinate[] | null> {
  const [solved] = await executor
    .select({ id: solves.id })
    .from(solves)
    .innerJoin(challenges, eq(challenges.id, solves.challengeId))
    .where(and(eq(solves.teamId, teamId), eq(challenges.difficulty, 'main_difficult')));
  if (!solved) return null;
  return executor
    .select({ label: finalCoordinates.label, value: finalCoordinates.value })
    .from(finalCoordinates)
    .orderBy(asc(finalCoordinates.position));
}

// docs/08 §3. Fragments come only through this team's own solves, listed by question number: the
// real sequence (coordinate_order) is never sent, only the clue an admin wrote for it.
export async function getCoordinateBoard(teamId: string) {
  const fragments = await db
    .select({
      number: challenges.number,
      title: challenges.title,
      difficulty: challenges.difficulty,
      value: challenges.fragmentValue,
      orderClue: challenges.orderClue,
    })
    .from(solves)
    .innerJoin(challenges, eq(challenges.id, solves.challengeId))
    .where(
      and(
        eq(solves.teamId, teamId),
        isNotNull(challenges.fragmentValue),
        // A question that hides its coordinate in the flag needs the team to have typed it in.
        sql`(NOT ${challenges.fragmentNeedsEntry} OR EXISTS (SELECT 1 FROM ${fragmentClaims} fc
          WHERE fc.team_id = ${teamId} AND fc.challenge_id = ${challenges.id}))`,
      ),
    )
    .orderBy(asc(challenges.number));
  const final = await finalCoordinatesFor(db, teamId);
  const [found] = await db
    .select({ id: coordinateSubmissions.id })
    .from(coordinateSubmissions)
    .where(
      and(eq(coordinateSubmissions.teamId, teamId), eq(coordinateSubmissions.isCorrect, true)),
    );
  return {
    slots: FRAGMENT_SLOTS,
    fragments: fragments.map((f) => ({ ...f, value: f.value! })),
    finalCoordinates: final,
    found: found !== undefined,
  };
}

export type CoordinateBoard = Awaited<ReturnType<typeof getCoordinateBoard>>;
