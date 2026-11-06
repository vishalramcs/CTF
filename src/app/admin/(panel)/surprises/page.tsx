import { loadEventState } from '@/lib/admin/event';
import { FlashyPanel } from '@/components/admin/flashy-panel';
import { PageTitle } from '@/components/admin/page-title';
import { SurprisesPanel } from '@/components/admin/surprises-panel';
import { loadSurprises } from '@/lib/admin/surprises';
import { loadFlashyAdmin } from '@/lib/flashy/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function SurprisesPage() {
  await requireAdmin();
  const event = await loadEventState();

  return (
    <>
      <PageTitle>Surprises</PageTitle>
      <FlashyPanel view={await loadFlashyAdmin()} timeZone={env.EVENT_TIMEZONE} />
      <SurprisesPanel
        surprises={(await loadSurprises()).filter((s) => s.kind === 'spidey_signal')}
        timeZone={env.EVENT_TIMEZONE}
        notStarted={event.status === 'not_started'}
      />
    </>
  );
}
