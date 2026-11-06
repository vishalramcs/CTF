import { sql } from 'drizzle-orm';

import { finalCoordinatesFor, type FinalCoordinate } from '@/lib/coordinates/state';
import { fragmentId } from '@/lib/coordinates/fragments';
import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { partSolves, solves, submissions } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalizeFlag } from '@/lib/flags/normalize';

// docs/12. The Main Question has six beacon flags. Part n earns fragment slot n.

export type PartRow = { id: string; part: number; flag_hash: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PartResult =
  | {
      result: 'part';
      part: number;
      found: number;
      total: number;
      points: number;
      position: number;
      fragmentId: string;
      fragment: string | null;
      finalCoordinates?: FinalCoordinate[];
    }
  | { result: 'part_already_found'; part: number };

export async function partsOf(executor: Pick<typeof db, 'execute'>, challengeId: string) {
  return executor.execute<PartRow>(sql`
    SELECT id, part, flag_hash FROM app.challenge_parts
     WHERE challenge_id = ${challengeId} ORDER BY part`);
}

// Which parts this team has found, with their points. null when the challenge has no parts.
export async function teamParts(teamId: string, challengeId: string) {
  const rows = await db.execute<{ part: number; points: string | null }>(sql`
    SELECT p.part, s.points_awarded AS points
      FROM app.challenge_parts p
      LEFT JOIN app.part_solves s ON s.part_id = p.id AND s.team_id = ${teamId}
     WHERE p.challenge_id = ${challengeId} ORDER BY p.part`);
  if (rows.length === 0) return null;
  const found = rows.filter((r) => r.points !== null);
  return {
    total: rows.length,
    found: found.map((r) => r.part),
    points: found.reduce((sum, r) => sum + Number(r.points), 0),
  };
}

// Called inside submitFlag's transaction, after the event and rate-limit checks. Writes the attempt
// row, then at most one part solve (unique per team and part); the sixth part writes the
// challenge's own solve, which pays nothing (migration 0008) but marks the Main Question done.
export async function submitPart(
  tx: Tx,
  { teamId, sessionId }: { teamId: string; sessionId: string },
  challengeId: string,
  parts: PartRow[],
  input: string,
  preview: (input: string) => string,
): Promise<PartResult | { result: 'wrong' }> {
  const normalized = normalizeFlag(input, env.FLAG_PREFIX);
  const hash = normalized ? hmacHex(env.FLAG_HMAC_KEY, normalized) : '';
  const match = hash ? parts.find((p) => safeEqual(hash, p.flag_hash)) : undefined;
  await tx.insert(submissions).values({
    teamId,
    challengeId,
    sessionId,
    submittedHash: hash,
    submittedPreview: match ? null : preview(input),
    isCorrect: Boolean(match),
    result: match ? 'correct' : normalized ? 'wrong' : 'malformed',
  });
  if (!match) return { result: 'wrong' };

  const [solve] = await tx
    .insert(partSolves)
    .values({ teamId, partId: match.id })
    .onConflictDoNothing({ target: [partSolves.teamId, partSolves.partId] })
    .returning({ points: partSolves.pointsAwarded, position: partSolves.solvePosition });
  if (!solve) return { result: 'part_already_found', part: match.part };

  const [{ found }] = await tx.execute<{ found: number }>(sql`
    SELECT count(*)::int AS found FROM app.part_solves s
      JOIN app.challenge_parts p ON p.id = s.part_id
     WHERE s.team_id = ${teamId} AND p.challenge_id = ${challengeId}`);
  if (found === parts.length) {
    await tx
      .insert(solves)
      .values({ teamId, challengeId })
      .onConflictDoNothing({ target: [solves.teamId, solves.challengeId] });
  }
  const [frag] = await tx.execute<{ value: string | null }>(sql`
    SELECT fragment_value AS value FROM app.challenges WHERE coordinate_order = ${match.part}`);
  const final = await finalCoordinatesFor(tx, teamId);
  return {
    result: 'part',
    part: match.part,
    found,
    total: parts.length,
    points: Number(solve.points),
    position: solve.position,
    fragmentId: fragmentId(match.part),
    fragment: frag?.value ?? null,
    ...(final ? { finalCoordinates: final } : {}),
  };
}
