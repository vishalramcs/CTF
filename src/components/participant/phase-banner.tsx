import type { EventStatus } from '@/lib/scoring/points';

export const STATUS: Record<EventStatus, { name: string; rule: string }> = {
  not_started: { name: 'Standing by', rule: 'The event has not started. The trails open soon.' },
  running: { name: 'Live', rule: 'All 10 challenges are open. Find the Cosmic Keys.' },
  paused: { name: 'Paused', rule: 'The event is paused. Submissions are closed for now.' },
  ended: { name: 'Ended', rule: 'The event is over. Thanks for playing.' },
};

// The layout copy is server-rendered; the dashboard shows the live status.
export function StatusBanner({ status }: { status: EventStatus }) {
  const { name, rule } = STATUS[status];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-card px-4 py-2 text-sm">
      <p className="font-heading text-lg font-bold uppercase" role="status">
        {name}
      </p>
      <p className="text-muted-foreground">{rule}</p>
    </div>
  );
}
