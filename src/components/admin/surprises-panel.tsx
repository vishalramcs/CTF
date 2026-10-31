'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Field, Notice } from '@/components/admin/fields';
import {
  panelClass,
  SectionTitle,
  tableClass,
  tdClass,
  thClass,
} from '@/components/admin/page-title';
import { actionClass, ErrorText, inputClass, textareaClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import type { loadSurprises } from '@/lib/admin/surprises';
import { formatTime } from '@/lib/admin/shared';

type Surprise = Awaited<ReturnType<typeof loadSurprises>>[number];

const pad = (n: number) => String(n).padStart(2, '0');

// datetime-local wants the browser's own wall-clock time, so this only runs after mount.
function toLocalInput(value: Date | string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export function SurprisesPanel({
  surprises,
  timeZone,
  notStarted,
}: {
  surprises: Surprise[];
  timeZone: string;
  notStarted: boolean;
}) {
  return (
    <>
      {surprises.map((s) => (
        <SurpriseCard key={s.id} surprise={s} timeZone={timeZone} notStarted={notStarted} />
      ))}
    </>
  );
}

// docs/08 §9. The word becomes the Spidey Signal answer, so sending it also opens the surprise.
function MorseSender({ enabled }: { enabled: boolean }) {
  const { run, pending, error } = useAction();
  const [word, setWord] = useState('');
  const [sent, setSent] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setSent(false);
    const saved = await run('PATCH', '/api/admin/surprises/spidey_signal', { answer: word });
    if (!saved.ok) return;
    const activated = await run('POST', '/api/admin/surprises/spidey_signal/activate');
    if (!activated.ok) return;
    setSent(true);
    setWord('');
  }

  return (
    <form onSubmit={send} className="space-y-3 border-b border-border pb-4">
      <p role="status" className="text-sm">
        Morse spider: {enabled ? 'on, blinking on team screens' : 'off'}.
      </p>
      <Field
        label="Morse word"
        hint="Letters, digits and spaces. Teams see it within 30 seconds, and it repeats until they solve it."
      >
        <input
          required
          autoComplete="off"
          maxLength={30}
          pattern="[A-Za-z0-9 ]+"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className={actionClass} disabled={pending || !word.trim()}>
          Send
        </Button>
        {enabled && (
          <Button
            type="button"
            variant="outline"
            className={actionClass}
            disabled={pending}
            onClick={() => {
              setSent(false);
              return run('PATCH', '/api/admin/surprises/spidey_signal', { enabled: false });
            }}
          >
            Stop
          </Button>
        )}
        {sent && (
          <span role="status" className="text-sm">
            Sent.
          </span>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function SurpriseCard({
  surprise: s,
  timeZone,
  notStarted,
}: {
  surprise: Surprise;
  timeZone: string;
  notStarted: boolean;
}) {
  const { run, pending, error } = useAction();
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [enabled, setEnabled] = useState(s.enabled);
  const [saved, setSaved] = useState(false);
  const [revealed, setRevealed] = useState<string>();

  useEffect(() => {
    setFrom(toLocalInput(s.availableFrom));
    setUntil(toLocalInput(s.availableUntil));
    setEnabled(s.enabled);
  }, [s.availableFrom, s.availableUntil, s.enabled]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const answer = String(f.get('answer') ?? '');
    const result = await run('PATCH', `/api/admin/surprises/${s.kind}`, {
      title: String(f.get('title')),
      contentHtml: String(f.get('contentHtml')),
      assetUrl: String(f.get('assetUrl') ?? '').trim() || null,
      availableFrom: toIso(from),
      availableUntil: toIso(until),
      enabled,
      ...(answer.trim() ? { answer } : {}),
    });
    setSaved(result.ok);
    if (result.ok) form.reset();
  }

  return (
    <section className={panelClass} aria-label={s.title}>
      <SectionTitle>{s.title}</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Reward {s.points} points (fixed by the rules). Answer: {s.hasAnswer ? 'set' : 'not set'}.
        Status: {s.enabled ? 'enabled' : 'disabled'}. Completed by {s.completions} of{' '}
        {s.teams.length} teams that found it.
      </p>
      {notStarted && (
        <Notice>
          The event has not started. A surprise can be found whatever the event status, so enabling
          one needs an availability start time.
        </Notice>
      )}
      {s.kind === 'spidey_signal' && <MorseSender enabled={s.enabled} />}
      <form onSubmit={save} className="space-y-3">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-5"
          />
          Enabled
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <input
              name="title"
              required
              maxLength={80}
              defaultValue={s.title}
              className={inputClass}
            />
          </Field>
          <Field label="Asset URL" hint="https:// address or a /path (the Flashy Spider video).">
            <input
              name="assetUrl"
              maxLength={500}
              defaultValue={s.assetUrl ?? ''}
              className={inputClass}
            />
          </Field>
          <Field label="Available from" hint="Your browser's time zone.">
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Available until" hint="Your browser's time zone.">
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Content (HTML)" hint="The task or question teams see.">
          <textarea
            name="contentHtml"
            rows={5}
            defaultValue={s.contentHtml}
            className={textareaClass}
          />
        </Field>
        <Field label="Answer" hint="Leave blank to keep the current answer.">
          <input name="answer" autoComplete="off" maxLength={200} className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className={actionClass} disabled={pending}>
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            className={actionClass}
            disabled={pending || !s.hasAnswer}
            onClick={() => run('POST', `/api/admin/surprises/${s.kind}/activate`)}
          >
            Activate now
          </Button>
          {s.hasAnswer && (
            <Button
              type="button"
              variant="outline"
              className={actionClass}
              disabled={pending}
              onClick={async () => {
                const result = await run<{ answer: string }>(
                  'POST',
                  `/api/admin/surprises/${s.kind}/reveal`,
                );
                if (result.ok) setRevealed(result.data.answer);
              }}
            >
              View current answer
            </Button>
          )}
          {saved && (
            <span role="status" className="text-sm">
              Saved.
            </span>
          )}
          {revealed !== undefined && (
            <span role="status" className="font-mono text-sm">
              Answer: {revealed}
            </span>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
      </form>

      <h3 className="font-medium">Teams that found it</h3>
      {s.teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Team</th>
                <th className={thClass}>Discovered</th>
                <th className={thClass}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {s.teams.map((t) => (
                <tr key={t.team}>
                  <td className={tdClass}>{t.team}</td>
                  <td className={tdClass}>{formatTime(t.discoveredAt, timeZone)}</td>
                  <td className={tdClass}>
                    {t.completedAt ? formatTime(t.completedAt, timeZone) : 'Not yet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
