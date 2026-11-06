import { ChallengesPanel } from '@/components/admin/challenges-panel';
import { PageTitle } from '@/components/admin/page-title';
import { fragmentSlots, listChallenges, workspaceNames } from '@/lib/admin/challenges';
import { listTeams } from '@/lib/admin/teams';
import { requireAdmin } from '@/lib/auth/guards';

export default async function ChallengesPage() {
  await requireAdmin();
  const rows = await listChallenges();
  const slots = await fragmentSlots();
  const teams = (await listTeams()).map(({ id, name }) => ({ id, name }));

  return (
    <>
      <PageTitle>Challenges</PageTitle>
      <ChallengesPanel
        rows={rows}
        teams={teams}
        slots={slots}
        workspaces={await workspaceNames()}
      />
    </>
  );
}
