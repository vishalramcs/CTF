import { and, asc, eq, or, sql } from 'drizzle-orm';
import { cache } from 'react';

import {
  allFragmentsFor,
  finalCoordinatesFor,
  type FinalCoordinate,
  type FragmentRef,
} from '@/lib/coordinates/state';
import { db } from '@/lib/db/client';
import {
  challengeHints,
  challenges,
  eventState,
  solves,
  teamChallengeUnlocks,
  teamChallengeVariants,
  vPublicScoreboard,
  vScoreboard,
} from '@/lib/db/schema';
import {
  challengeAccess,
  nextPoints,
  type ChallengeAccess,
  type EventStatus,
} from '@/lib/scoring/points';
import type { VariantData } from '@/lib/variants/generators/template';
import { sanitizeHtml } from '@/lib/variants/sanitize';

// Explicit columns everywhere in this file: flag hashes and unearned fragments never get loaded.

export const getEventState = cache(async () => {
  const [state] = await db
    .select({
      status: eventState.status,
      submissionsOpen: eventState.submissionsOpen,
      leaderboardFrozen: eventState.leaderboardFrozen,
    })
    .from(eventState);
  return { ...state, status: state.status as EventStatus };
});

// Rank is null for a hidden team, and while frozen: a live rank would give away the frozen board.
export const getTeamScore = cache(async (teamId: string) => {
  const state = await getEventState();
  const [row] = await db
    .select({ score: vScoreboard.total, rank: vPublicScoreboard.rank })
    .from(vScoreboard)
    .leftJoin(vPublicScoreboard, eq(vPublicScoreboard.teamName, vScoreboard.teamName))
    .where(eq(vScoreboard.teamId, teamId));
  return {
    score: Number(row?.score ?? 0),
    rank: state.leaderboardFrozen ? null : (row?.rank ?? null),
  };
});

export type ChallengeCard = {
  number: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'difficult' | 'main_difficult';
  basePoints: number;
  currentPoints: number;
  state: ChallengeAccess | 'solved' | 'sealed';
  pointsEarned: number | null;
};

// A full-access team (a tester, docs/09 §4) reads every question whatever its status or the event's.
const fullAccess = (teamId: string) =>
  sql<boolean>`EXISTS (SELECT 1 FROM app.teams ft WHERE ft.id = ${teamId} AND ft.full_access)`;

export async function hasFullAccess(teamId: string): Promise<boolean> {
  const [row] = await db.select({ full: fullAccess(teamId) }).from(eventState);
  return row.full;
}

// A sealed question hides its title and content until this team unlocks it. A team that somehow
// solved it first keeps access. Every read path uses this, so hiding it is never only a UI matter.
const SEALED_TITLE = 'Sealed trail';
const sealedFor = (teamId: string) => sql<boolean>`(${challenges.requiresUnlock}
  AND NOT ${fullAccess(teamId)}
  AND NOT EXISTS (SELECT 1 FROM ${teamChallengeUnlocks} u
    WHERE u.team_id = ${teamId} AND u.challenge_id = ${challenges.id})
  AND NOT EXISTS (SELECT 1 FROM ${solves} s3
    WHERE s3.team_id = ${teamId} AND s3.challenge_id = ${challenges.id}))`;

// What the next solve of each challenge is worth: the two-tier position formula (docs/08 §2).
// TRD §7.2: which challenges carry fragments is not revealed.
export async function listChallengeCards(
  teamId: string,
  status: EventStatus,
): Promise<ChallengeCard[]> {
  const rows = await db
    .select({
      number: challenges.number,
      title: challenges.title,
      difficulty: challenges.difficulty,
      basePoints: challenges.basePoints,
      pointsEarned: solves.pointsAwarded,
      sealed: sealedFor(teamId),
      full: fullAccess(teamId),
      priorSolves: sql<number>`(SELECT count(*)::int FROM ${solves} s2
        WHERE s2.challenge_id = ${challenges.id})`,
    })
    .from(challenges)
    .leftJoin(solves, and(eq(solves.challengeId, challenges.id), eq(solves.teamId, teamId)))
    .where(or(eq(challenges.isPublished, true), fullAccess(teamId)))
    .orderBy(asc(challenges.number));

  return rows.map(({ pointsEarned, priorSolves, sealed, full, ...card }) => ({
    ...card,
    title: sealed ? SEALED_TITLE : card.title,
    currentPoints: nextPoints(card.basePoints, priorSolves),
    state:
      pointsEarned !== null
        ? 'solved'
        : sealed
          ? 'sealed'
          : full
            ? 'open'
            : challengeAccess(status),
    pointsEarned: pointsEarned === null ? null : Number(pointsEarned),
  }));
}

function parseChallengeNumber(param: string): number | null {
  return /^(1[0-3]|[1-9])$/.test(param) ? Number(param) : null;
}

// What submit and hints need. A question sealed for this team doesn't exist as far as they can tell.
export async function findPublishedChallenge(param: string, teamId: string) {
  const number = parseChallengeNumber(param);
  if (number === null) return null;
  const [challenge] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(
      and(
        eq(challenges.number, number),
        or(eq(challenges.isPublished, true), fullAccess(teamId)),
        sql`NOT ${sealedFor(teamId)}`,
      ),
    );
  return challenge ?? null;
}

type ChallengeHeader = {
  number: number;
  title: string;
  difficulty: ChallengeCard['difficulty'];
};

export type ChallengeView =
  | (ChallengeHeader & { access: 'locked' | 'closed' | 'sealed' })
  | (ChallengeHeader & {
      access: 'open';
      workspace: string | null;
      category: string;
      story: string;
      html: string;
      evidence: VariantData['evidence'];
      surfaces: VariantData['surfaces'];
      files: VariantData['files'];
      hintCount: number;
      currentPoints: number;
      solved: {
        points: number;
        fragment: string | null;
        orderClue: string | null;
        finalCoordinates: FinalCoordinate[] | null;
        fragments: FragmentRef[] | null;
      } | null;
    });

// Rendered per team (TRD §9). null if it doesn't exist or this team has no variant yet.
export async function getChallengeView(
  teamId: string,
  param: string,
): Promise<ChallengeView | null> {
  const number = parseChallengeNumber(param);
  if (number === null) return null;

  // One after the other: the app has a single pooled connection, and overlapping queries on it
  // stall behind Supavisor.
  const state = await getEventState();
  const [row] = await db
    .select({
      number: challenges.number,
      title: challenges.title,
      difficulty: challenges.difficulty,
      category: challenges.category,
      basePoints: challenges.basePoints,
      story: challenges.storyMd,
      variantData: teamChallengeVariants.variantData,
      generatorConfig: challenges.generatorConfig,
      sealed: sealedFor(teamId),
      full: fullAccess(teamId),
      pointsEarned: solves.pointsAwarded,
      // Joined only through the team's own solve, so an unsolved challenge returns no fragment.
      fragmentValue: sql<
        string | null
      >`CASE WHEN ${solves.id} IS NOT NULL THEN ${challenges.fragmentValue} END`,
      orderClue: sql<
        string | null
      >`CASE WHEN ${solves.id} IS NOT NULL THEN ${challenges.orderClue} END`,
      priorSolves: sql<number>`(SELECT count(*)::int FROM ${solves} s2
          WHERE s2.challenge_id = ${challenges.id})`,
      hintCount: sql<number>`(SELECT count(*)::int FROM ${challengeHints}
          WHERE ${challengeHints.challengeId} = ${challenges.id})`,
    })
    .from(challenges)
    .leftJoin(
      teamChallengeVariants,
      and(
        eq(teamChallengeVariants.challengeId, challenges.id),
        eq(teamChallengeVariants.teamId, teamId),
      ),
    )
    .leftJoin(solves, and(eq(solves.challengeId, challenges.id), eq(solves.teamId, teamId)))
    .where(
      and(
        eq(challenges.number, number),
        or(eq(challenges.isPublished, true), fullAccess(teamId)),
      ),
    );
  if (!row) return null;
  if (row.sealed) {
    return {
      number: row.number,
      title: SEALED_TITLE,
      difficulty: row.difficulty,
      access: 'sealed',
    };
  }

  const header: ChallengeHeader = {
    number: row.number,
    title: row.title,
    difficulty: row.difficulty,
  };
  const access = row.full ? 'open' : challengeAccess(state.status);
  if (access !== 'open') return { ...header, access };
  if (!row.variantData) return null;

  const solvedHere = row.pointsEarned !== null;
  const final =
    solvedHere && (row.difficulty === 'main_difficult' || row.fragmentValue)
      ? await finalCoordinatesFor(db, teamId)
      : null;
  const fragments =
    solvedHere && row.difficulty === 'main_difficult' ? await allFragmentsFor(db, teamId) : null;
  const variant = row.variantData as VariantData;
  return {
    ...header,
    access,
    workspace: (row.generatorConfig as { workspace?: string }).workspace ?? null,
    category: row.category,
    story: row.story,
    html: sanitizeHtml(variant.html),
    evidence: variant.evidence,
    surfaces: variant.surfaces,
    files: variant.files,
    hintCount: row.hintCount,
    currentPoints: nextPoints(row.basePoints, row.priorSolves),
    solved:
      row.pointsEarned === null
        ? null
        : {
            points: Number(row.pointsEarned),
            fragment: row.fragmentValue,
            orderClue: row.orderClue,
            finalCoordinates: final,
            fragments: fragments && fragments.length > 0 ? fragments : null,
          },
  };
}
