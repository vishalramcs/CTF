import { PageTitle } from '@/components/admin/page-title';
import { ScoresPanel } from '@/components/admin/scores-panel';
import { listTeams } from '@/lib/admin/teams';
import { requireAdmin } from '@/lib/auth/guards';

export default async function ScoresPage() {
  await requireAdmin();
  const teams = (await listTeams()).map(({ id, name }) => ({ id, name }));

  return (
    <>
      <PageTitle>Scores</PageTitle>
      <ScoresPanel teams={teams} />
    </>
  );
}
