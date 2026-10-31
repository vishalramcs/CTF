import { EventPanel } from '@/components/admin/event-panel';
import { PageTitle } from '@/components/admin/page-title';
import { loadEventState } from '@/lib/admin/event';
import type { EventStatus } from '@/lib/admin/shared';
import { requireAdmin } from '@/lib/auth/guards';

export default async function EventPage() {
  const session = await requireAdmin();
  const event = await loadEventState();

  return (
    <>
      <PageTitle>Event</PageTitle>
      <EventPanel
        status={event.status as EventStatus}
        submissionsOpen={event.submissionsOpen}
        leaderboardFrozen={event.leaderboardFrozen}
        isSuper={session.adminLevel === 'super_admin'}
      />
    </>
  );
}
