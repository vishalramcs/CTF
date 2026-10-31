import { MonitorPanel } from '@/components/admin/monitor-panel';
import { PageTitle } from '@/components/admin/page-title';
import { listTeams } from '@/lib/admin/teams';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function MonitorPage() {
  await requireAdmin();
  const teams = (await listTeams()).map(({ id, name }) => ({ id, name }));

  return (
    <>
      <PageTitle>Monitor</PageTitle>
      <p className="text-sm text-muted-foreground">
        Latest 100 flag, final location and surprise attempts.
      </p>
      <MonitorPanel teams={teams} timeZone={env.EVENT_TIMEZONE} />
    </>
  );
}
