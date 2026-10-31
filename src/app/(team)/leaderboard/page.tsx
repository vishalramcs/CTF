import { LiveLeaderboard } from '@/components/leaderboard/live-board';
import { requireTeam } from '@/lib/auth/guards';

export default async function LeaderboardPage() {
  const { teamName } = await requireTeam();
  return (
    <main className="mx-auto max-w-[1200px] p-4">
      <LiveLeaderboard ownTeam={teamName} />
    </main>
  );
}
