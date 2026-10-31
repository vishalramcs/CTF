import { LiveLeaderboard } from '@/components/leaderboard/live-board';
import { requireAdmin } from '@/lib/auth/guards';

// Venue projector view. Admin session only.
export default async function ScreenPage() {
  await requireAdmin();
  return (
    <main className="min-h-screen p-8">
      <LiveLeaderboard large />
    </main>
  );
}
