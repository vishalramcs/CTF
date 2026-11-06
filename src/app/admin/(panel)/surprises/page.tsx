import { loadEventState } from '@/lib/admin/event';
import { PageTitle } from '@/components/admin/page-title';
import { SurprisesPanel } from '@/components/admin/surprises-panel';
import { loadSurprises } from '@/lib/admin/surprises';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function SurprisesPage() {
  await requireAdmin();
  const event = await loadEventState();

  return (
    <>
      <PageTitle>Surprises</PageTitle>
      <SurprisesPanel
        surprises={(await loadSurprises()).filter(
          (s) => s.kind === 'spidey_signal' || s.kind === 'flashy_spider',
        )}
        timeZone={env.EVENT_TIMEZONE}
        notStarted={event.status === 'not_started'}
      />
    </>
  );
}
