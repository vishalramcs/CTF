import { and, asc, eq, sql } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/lib/db/client';
import {
  challengeHints,
  challenges,
  coordinateFragments,
  eventState,
  solves,
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
  state: ChallengeAccess | 'solved';
  pointsEarned: number | null;
};

// What the next solve of each challenge is worth: base minus 0.5 per team that already solved it.
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
      priorSolves: sql<number>`(SELECT count(*)::int FROM ${solves} s2
        WHERE s2.challenge_id = ${challenges.id})`,
    })
    .from(challenges)
    .leftJoin(solves, and(eq(solves.challengeId, challenges.id), eq(solves.teamId, teamId)))
    .where(eq(challenges.isPublished, true))
    .orderBy(asc(challenges.number));

  return rows.map(({ pointsEarned, priorSolves, ...card }) => ({
    ...card,
    currentPoints: nextPoints(card.basePoints, priorSolves),
    state: pointsEarned !== null ? 'solved' : challengeAccess(status),
    pointsEarned: pointsEarned === null ? null : Number(pointsEarned),
  }));
}

function parseChallengeNumber(param: string): number | null {
  return /^(10|[1-9])$/.test(param) ? Number(param) : null;
}

// What submit and hints need.
export async function findPublishedChallenge(param: string) {
  const number = parseChallengeNumber(param);
  if (number === null) return null;
  const [challenge] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(and(eq(challenges.number, number), eq(challenges.isPublished, true)));
  return challenge ?? null;
}

type ChallengeHeader = {
  number: number;
  title: string;
  difficulty: ChallengeCard['difficulty'];
};

export type ChallengeView =
  | (ChallengeHeader & { access: 'locked' | 'closed' })
  | (ChallengeHeader & {
      access: 'open';
      category: string;
      story: string;
      html: string;
      evidence: VariantData['evidence'];
      surfaces: VariantData['surfaces'];
      files: VariantData['files'];
      hintCount: number;
      currentPoints: number;
      solved: { points: number; fragment: string | null; orderClue: string | null } | null;
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
      pointsEarned: solves.pointsAwarded,
      // Joined only through the team's own solve, so an unsolved challenge returns no fragment.
      fragmentValue: sql<
        string | null
      >`CASE WHEN ${solves.id} IS NOT NULL THEN ${coordinateFragments.value} END`,
      orderClue: sql<
        string | null
      >`CASE WHEN ${solves.id} IS NOT NULL THEN ${coordinateFragments.orderClue} END`,
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
    .leftJoin(coordinateFragments, eq(coordinateFragments.challengeId, challenges.id))
    .where(and(eq(challenges.number, number), eq(challenges.isPublished, true)));
  if (!row) return null;

  const header: ChallengeHeader = {
    number: row.number,
    title: row.title,
    difficulty: row.difficulty,
  };
  const access = challengeAccess(state.status);
  if (access !== 'open') return { ...header, access };
  if (!row.variantData) return null;

  const variant = row.variantData as VariantData;
  return {
    ...header,
    access,
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
          },
  };
}
