import { DashboardClient } from '@/components/participant/dashboard-client';
import type { LocationView } from '@/components/locations/location-panel';
import { requireTeam } from '@/lib/auth/guards';
import { listLocations } from '@/lib/locations/state';
import { listAnnouncements } from '@/lib/participant/announcements';
import { listCompletedSurprises } from '@/lib/participant/history';
import { getEventState, getTeamScore, listChallengeCards } from '@/lib/scoring/team-state';

export default async function DashboardPage() {
  const { teamId, teamName } = await requireTeam();
  // One after the other: the app has a single pooled connection.
  const { status } = await getEventState();
  const { score, rank } = await getTeamScore(teamId);
  const cards = await listChallengeCards(teamId, status);
  const locations = await listLocations(teamId);
  const announcements = await listAnnouncements();
  const surprises = await listCompletedSurprises(teamId);

  // Dates become strings for the browser. Locations carry only fragments this team has earned.
  const view: LocationView[] = locations.map((l) => ({
    ...l,
    achievedAt: l.achievedAt?.toISOString() ?? null,
    key: l.key ? { name: l.key.name, acquiredAt: l.key.acquiredAt.toISOString() } : null,
  }));

  return (
    <DashboardClient
      teamName={teamName}
      score={score}
      rank={rank}
      cards={cards}
      locations={view}
      announcements={announcements}
      surprises={surprises}
    />
  );
}
