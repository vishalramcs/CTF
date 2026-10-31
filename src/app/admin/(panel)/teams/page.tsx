import { PageTitle } from '@/components/admin/page-title';
import { TeamsPanel } from '@/components/admin/teams-panel';
import { listTeams } from '@/lib/admin/teams';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function TeamsPage() {
  await requireAdmin();

  return (
    <>
      <PageTitle>Teams</PageTitle>
      <TeamsPanel
        teams={await listTeams()}
        timeZone={env.EVENT_TIMEZONE}
        maxSessions={env.MAX_SESSIONS_PER_TEAM}
      />
    </>
  );
}
