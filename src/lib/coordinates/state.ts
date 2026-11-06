import { and, asc, eq, sql } from 'drizzle-orm';

import { FRAGMENT_SLOTS, fragmentId, LOCATIONS } from '@/lib/coordinates/fragments';
import { db } from '@/lib/db/client';
import { coordinateSubmissions, finalCoordinates } from '@/lib/db/schema';

export type FinalCoordinate = { label: string; value: string };
export type FragmentRef = { id: string; value: string };

type Executor = Pick<typeof db, 'execute'>;

type Held = {
  order: number;
  value: string;
  number: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'difficult' | 'main_difficult';
  orderClue: string | null;
};

// Fragments a team has earned, and nothing else. Fragment n comes from the team's own solve of the
// question that carries it, or from finding beacon flag n of the Main Question (docs/12). Derived
// from `solves` and `part_solves` (each unique per team), so an award can never be duplicated.
async function heldFragments(executor: Executor, teamId: string): Promise<Held[]> {
  const rows = await executor.execute<{
    order: number;
    value: string;
    number: number;
    title: string;
    difficulty: Held['difficulty'];
    order_clue: string | null;
  }>(sql`
    SELECT c.coordinate_order AS "order", c.fragment_value AS value, c.number, c.title,
           c.difficulty, c.order_clue
      FROM app.challenges c
     WHERE c.fragment_value IS NOT NULL AND c.coordinate_order IS NOT NULL
       AND (
         EXISTS (SELECT 1 FROM app.solves s WHERE s.team_id = ${teamId}
                  AND s.challenge_id = c.id)
         OR EXISTS (SELECT 1 FROM app.part_solves s
                      JOIN app.challenge_parts p ON p.id = s.part_id
                     WHERE s.team_id = ${teamId} AND p.part = c.coordinate_order)
       )
     ORDER BY c.coordinate_order`);
  return rows.map((r) => ({
    order: r.order,
    value: r.value,
    number: r.number,
    title: r.title,
    difficulty: r.difficulty,
    orderClue: r.order_clue,
  }));
}

// The reconstructed locations: those whose North and South fragments the team holds. Fixed positions 1-3 in app.final_coordinates carry the
// organiser's text for each. Takes the caller's executor so a submit reads them in its own
// transaction. null when none is reconstructed yet.
export async function finalCoordinatesFor(
  executor: Executor & Pick<typeof db, 'select'>,
  teamId: string,
): Promise<FinalCoordinate[] | null> {
  const held = new Set((await heldFragments(executor, teamId)).map((f) => f.order));
  const rows = await executor
    .select({
      position: finalCoordinates.position,
      label: finalCoordinates.label,
      value: finalCoordinates.value,
    })
    .from(finalCoordinates)
    .orderBy(asc(finalCoordinates.position));
  const named = await namedPositions(executor, teamId);
  const out = rows.filter((r) => held.has(2 * r.position - 1) && held.has(2 * r.position));
  // The place name is the location answer (docs/12), so it stays hidden until the team gives it.
  return out.length > 0
    ? out.map(({ position, label, value }) => ({
        label: named.has(position) ? label : '',
        value,
      }))
    : null;
}

// Locations whose place name this team has answered correctly.
export async function namedPositions(executor: Executor, teamId: string): Promise<Set<number>> {
  const rows = await executor.execute<{ position: number }>(sql`
    SELECT position FROM app.location_answers WHERE team_id = ${teamId} AND is_correct`);
  return new Set(rows.map((r) => r.position));
}

// Every fragment this team holds.
export async function allFragmentsFor(executor: Executor, teamId: string): Promise<FragmentRef[]> {
  return (await heldFragments(executor, teamId)).map((f) => ({
    id: fragmentId(f.order),
    value: f.value,
  }));
}

// docs/11. The board: three locations, each with a North and a South fragment. A fragment value
// appears only once this team holds it; a location's text only once both halves are held.
export async function getCoordinateBoard(teamId: string) {
  const held = await heldFragments(db, teamId);
  const final = await finalCoordinatesFor(db, teamId);
  const named = await namedPositions(db, teamId);
  const rows = await db
    .select({
      position: finalCoordinates.position,
      label: finalCoordinates.label,
      value: finalCoordinates.value,
    })
    .from(finalCoordinates)
    .orderBy(asc(finalCoordinates.position));
  const [found] = await db
    .select({ id: coordinateSubmissions.id })
    .from(coordinateSubmissions)
    .where(
      and(eq(coordinateSubmissions.teamId, teamId), eq(coordinateSubmissions.isCorrect, true)),
    );

  const slot = (order: number) => {
    const f = held.find((h) => h.order === order);
    return {
      id: fragmentId(order),
      held: f !== undefined,
      value: f?.value ?? null,
      from: f ? f.number : null,
    };
  };
  const locations = Array.from({ length: LOCATIONS }, (_, i) => {
    const position = i + 1;
    const north = slot(2 * position - 1);
    const south = slot(2 * position);
    const reconstructed = north.held && south.held;
    const text = reconstructed ? (rows.find((r) => r.position === position) ?? null) : null;
    return {
      position,
      north,
      south,
      reconstructed,
      // The place name is what the team must find, so it is sent only once answered.
      answered: named.has(position),
      label: named.has(position) ? (text?.label ?? null) : null,
      text: text?.value ?? null,
    };
  });

  const [{ points }] = await db.execute<{ points: string }>(
    sql`SELECT location_points AS points FROM app.event_state WHERE id = 1`,
  );

  return {
    slots: FRAGMENT_SLOTS,
    locationPoints: Number(points),
    fragments: held.map((f) => ({
      number: f.number,
      title: f.title,
      difficulty: f.difficulty,
      value: f.value,
      orderClue: f.orderClue,
    })),
    locations,
    finalCoordinates: final,
    found: found !== undefined,
  };
}

export type CoordinateBoard = Awaited<ReturnType<typeof getCoordinateBoard>>;
