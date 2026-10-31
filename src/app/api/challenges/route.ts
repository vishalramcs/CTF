import { json, withTeam } from '@/lib/http';
import { getEventState, listChallengeCards } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

export const GET = withTeam(async (_req, session) => {
  const { status } = await getEventState();
  return json({ status, challenges: await listChallengeCards(session.teamId, status) });
});
