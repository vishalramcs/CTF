'use client';

import { useState, type FormEvent } from 'react';

import { Field, Notice } from '@/components/admin/fields';
import {
  panelClass,
  SectionTitle,
  tableClass,
  tdClass,
  thClass,
} from '@/components/admin/page-title';
import { actionClass, ErrorText, inputClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/admin/shared';
import type { FlashyAdminView } from '@/lib/flashy/admin';

// docs/10. Trigger and end the bonus event, set its video, options and bonus, and read the numbers.
export function FlashyPanel({ view, timeZone }: { view: FlashyAdminView; timeZone: string }) {
  const trigger = useAction();
  const settings = useAction();
  const [saved, setSaved] = useState(false);
  const { config } = view;
  const live = view.live !== null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const text = (name: string) => String(f.get(name) ?? '').trim();
    const correct = text('correct');
    const wrong = [text('wrong1'), text('wrong2'), text('wrong3')];
    const options = correct || wrong.some(Boolean) ? { correct, wrong } : {};
    const result = await settings.run('PATCH', '/api/admin/flashy', {
      videoUrl: text('videoUrl') || null,
      videoSeconds: Number(text('videoSeconds')),
      bonusPoints: Number(text('bonusPoints')),
      ...options,
    });
    setSaved(result.ok);
    if (result.ok) {
      for (const name of ['correct', 'wrong1', 'wrong2', 'wrong3']) {
        (form.elements.namedItem(name) as HTMLInputElement).value = '';
      }
    }
  }

  return (
    <section className={panelClass} aria-label="Flashy Spider-Man">
      <SectionTitle>Flashy Spider-Man (bonus event)</SectionTitle>
      <p role="status" className="text-sm">
        Status: <strong>{live ? 'LIVE' : 'Inactive'}</strong>.{' '}
        {config.bonusPoints > 0
          ? `Bonus ${config.bonusPoints} points, paid once to each team that answers correctly.`
          : 'Bonus is 0, so a correct answer pays nothing yet.'}
      </p>
      {!view.ready && (
        <Notice tone="warn">
          Not ready to trigger. Set the video address, and all four options with the correct one.
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className={actionClass}
          disabled={trigger.pending || live || !view.ready}
          onClick={() => {
            if (window.confirm('Trigger FLASHY SPIDER-MAN on every team screen now?')) {
              void trigger.run('POST', '/api/admin/flashy/trigger');
            }
          }}
        >
          Trigger event
        </Button>
        <Button
          type="button"
          variant="outline"
          className={actionClass}
          disabled={trigger.pending || !live}
          onClick={() => {
            if (window.confirm('End the event? No more answers or bonus will be accepted.')) {
              void trigger.run('POST', '/api/admin/flashy/end');
            }
          }}
        >
          End event
        </Button>
      </div>
      <ErrorText>{trigger.error}</ErrorText>

      <form onSubmit={save} className="space-y-3 border-t border-border pt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Video address"
            hint="https:// address or a /path. Teams see it only after pressing play."
          >
            <input
              name="videoUrl"
              maxLength={500}
              defaultValue={config.videoUrl ?? ''}
              className={inputClass}
            />
          </Field>
          <Field label="Video length (seconds)" hint="The question unlocks only after this long.">
            <input
              name="videoSeconds"
              type="number"
              min={5}
              max={600}
              required
              defaultValue={config.videoSeconds}
              className={inputClass}
            />
          </Field>
          <Field label="Bonus points" hint="Paid once per team through the normal score ledger.">
            <input
              name="bonusPoints"
              type="number"
              min={0}
              max={1000}
              step={0.01}
              required
              defaultValue={config.bonusPoints}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Correct option" hint="Never shown back after saving.">
            <input name="correct" maxLength={20} autoComplete="off" className={inputClass} />
          </Field>
          {[1, 2, 3].map((n) => (
            <Field key={n} label={`Other option ${n}`}>
              <input name={`wrong${n}`} maxLength={20} autoComplete="off" className={inputClass} />
            </Field>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Question: &ldquo;{config.question}&rdquo; Options set:{' '}
          {config.options.length === 4 ? config.options.join(', ') : 'none yet'}. Fill all four
          boxes to replace them, or leave all four empty to keep them. Which one is correct is not
          shown here.
        </p>
        <div className="flex items-center gap-2">
          <Button type="submit" className={actionClass} disabled={settings.pending}>
            Save settings
          </Button>
          {saved && (
            <span role="status" className="text-sm">
              Saved.
            </span>
          )}
        </div>
        <ErrorText>{settings.error}</ErrorText>
      </form>

      <div className="overflow-x-auto border-t border-border pt-4">
        <table className={tableClass}>
          <caption className="sr-only">Runs, newest first</caption>
          <thead>
            <tr>
              {[
                'Started',
                'Ended',
                'Teams',
                'Played',
                'Correct',
                'Wrong',
                'Skipped',
                'Still open',
                'Points paid',
              ].map((h) => (
                <th key={h} scope="col" className={thClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.runs.length === 0 && (
              <tr>
                <td colSpan={9} className={tdClass}>
                  Not triggered yet.
                </td>
              </tr>
            )}
            {view.runs.map((r) => (
              <tr key={r.id}>
                <td className={tdClass}>{formatTime(r.startedAt, timeZone)}</td>
                <td className={tdClass}>{r.endedAt ? formatTime(r.endedAt, timeZone) : 'Live'}</td>
                <td className={tdClass}>{r.teams}</td>
                <td className={tdClass}>{r.playing}</td>
                <td className={tdClass}>{r.correct}</td>
                <td className={tdClass}>{r.wrong}</td>
                <td className={tdClass}>{r.skipped}</td>
                <td className={tdClass}>{r.open}</td>
                <td className={tdClass}>{r.paid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
