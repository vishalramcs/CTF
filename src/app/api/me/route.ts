import { json, withTeam } from '@/lib/http';
import { getEventState, getTeamScore, listChallengeCards } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

export const GET = withTeam(async (_req, session) => {
  const { status, submissionsOpen } = await getEventState();
  const { score, rank } = await getTeamScore(session.teamId);
  const cards = await listChallengeCards(session.teamId, status);
  return json({
    teamName: session.teamName,
    score,
    rank,
    solved: cards.filter((c) => c.state === 'solved').map((c) => c.number),
    status,
    submissionsOpen,
    points: Object.fromEntries(cards.map((c) => [c.number, c.currentPoints])),
  });
});
