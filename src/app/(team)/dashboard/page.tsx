import { DashboardClient } from '@/components/participant/dashboard-client';
import { requireTeam } from '@/lib/auth/guards';
import { getCoordinateBoard } from '@/lib/coordinates/state';
import { listAnnouncements } from '@/lib/participant/announcements';
import { listCompletedSurprises } from '@/lib/participant/history';
import { getEventState, getTeamScore, listChallengeCards } from '@/lib/scoring/team-state';

export default async function DashboardPage() {
  const { teamId, teamName } = await requireTeam();
  // One after the other: the app has a single pooled connection.
  const { status } = await getEventState();
  const { score, rank } = await getTeamScore(teamId);
  const cards = await listChallengeCards(teamId, status);
  const board = await getCoordinateBoard(teamId);
  const announcements = await listAnnouncements();
  const surprises = await listCompletedSurprises(teamId);

  return (
    <DashboardClient
      teamName={teamName}
      score={score}
      rank={rank}
      cards={cards}
      board={board}
      announcements={announcements}
      surprises={surprises}
    />
  );
}
