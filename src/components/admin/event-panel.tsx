'use client';

import { useState } from 'react';

import { Notice } from '@/components/admin/fields';
import { panelClass, SectionTitle } from '@/components/admin/page-title';
import { actionClass, ConfirmModal, ErrorText } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import {
  STATUS_LABELS,
  TRANSITIONS,
  type EventStatus,
  type TransitionAction,
} from '@/lib/admin/shared';

const BUTTONS: { action: TransitionAction; label: string; confirm: string }[] = [
  {
    action: 'start',
    label: 'START',
    confirm: 'Teams can read challenges and submit flags straight away.',
  },
  { action: 'pause', label: 'PAUSE', confirm: 'Submissions stop until you resume.' },
  { action: 'resume', label: 'RESUME', confirm: 'Submissions open again.' },
  { action: 'end', label: 'END', confirm: 'The event ends for everyone. This can not be undone.' },
];

type Dialog = TransitionAction | 'reset';

export function EventPanel({
  status,
  submissionsOpen,
  leaderboardFrozen,
  isSuper,
}: {
  status: EventStatus;
  submissionsOpen: boolean;
  leaderboardFrozen: boolean;
  isSuper: boolean;
}) {
  const { run, error, pending } = useAction();
  const [dialog, setDialog] = useState<Dialog>();
  const close = () => setDialog(undefined);
  const active = BUTTONS.find((b) => b.action === dialog);

  return (
    <>
      <section className={panelClass}>
        <SectionTitle>Status</SectionTitle>
        <p className="text-3xl font-black tracking-wide uppercase" role="status">
          {STATUS_LABELS[status]}
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {BUTTONS.map(({ action, label }) => (
            <Button
              key={action}
              variant={action === 'end' ? 'destructive' : 'default'}
              className="h-14 text-lg font-black tracking-wide"
              disabled={
                pending || !(TRANSITIONS[action].from as readonly string[]).includes(status)
              }
              onClick={() => setDialog(action)}
            >
              {label}
            </Button>
          ))}
        </div>
        <ErrorText>{error}</ErrorText>
      </section>

      <section className={panelClass}>
        <SectionTitle>Switches</SectionTitle>
        <label className="flex items-center gap-3 font-medium">
          <input
            type="checkbox"
            className="size-5"
            checked={submissionsOpen}
            disabled={pending}
            onChange={() =>
              run('POST', '/api/admin/event/settings', { submissionsOpen: !submissionsOpen })
            }
          />
          Submissions {submissionsOpen ? 'open' : 'closed'}
          <span className="text-sm font-normal text-muted-foreground">
            (they are accepted only while the event is also running)
          </span>
        </label>
        <label className="flex items-center gap-3 font-medium">
          <input
            type="checkbox"
            className="size-5"
            checked={leaderboardFrozen}
            disabled={pending}
            onChange={() =>
              run('POST', '/api/admin/event/settings', { leaderboardFrozen: !leaderboardFrozen })
            }
          />
          Leaderboard {leaderboardFrozen ? 'frozen' : 'live'}
          <span className="text-sm font-normal text-muted-foreground">
            (freezing saves the public board as it is now)
          </span>
        </label>
      </section>

      {isSuper && (
        <section className={panelClass}>
          <SectionTitle>Reset test data</SectionTitle>
          <Notice tone="warn">
            Clears all solves, submissions, scores, locations, keys, surprise progress, hints and
            snapshots, and sets the event back to Not started. Teams, challenges and configuration
            stay.
          </Notice>
          <Button variant="destructive" className={actionClass} onClick={() => setDialog('reset')}>
            Reset test data
          </Button>
        </section>
      )}

      {active && (
        <ConfirmModal
          title={`${active.label} the event`}
          word={active.action === 'end' ? 'END' : undefined}
          label={active.label}
          onClose={close}
          onConfirm={async () => {
            const result = await run('POST', '/api/admin/event/transition', {
              action: active.action,
            });
            if (result.ok) close();
            else return result.message;
          }}
        >
          {active.confirm}
        </ConfirmModal>
      )}
      {dialog === 'reset' && (
        <ConfirmModal
          title="Reset test data"
          word="RESET"
          label="Reset"
          onClose={close}
          onConfirm={async () => {
            const result = await run('POST', '/api/admin/event/reset', { confirm: 'RESET' });
            if (result.ok) close();
            else return result.message;
          }}
        >
          Every team goes back to zero progress.
        </ConfirmModal>
      )}
    </>
  );
}
