'use client';

import { useState, type FormEvent } from 'react';

import { Field } from '@/components/admin/fields';
import { panelClass, SectionTitle } from '@/components/admin/page-title';
import { actionClass, ErrorText, inputClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';

export function ScoresPanel({ teams }: { teams: { id: string; name: string }[] }) {
  const { run, pending, error } = useAction();
  const [done, setDone] = useState<string>();

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const result = await run('POST', '/api/admin/scores/adjust', {
      teamId: String(f.get('teamId')),
      points: Number(f.get('points')),
      reason: String(f.get('reason')),
    });
    setDone(result.ok ? 'Adjustment saved.' : undefined);
    if (result.ok) form.reset();
  }

  return (
    <>
      <form onSubmit={adjust} className={panelClass}>
        <SectionTitle>Adjust a score</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Team">
            <select name="teamId" required className={inputClass}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Points" hint="Negative removes points. One decimal at most.">
            <input name="points" type="number" step="0.1" required className={inputClass} />
          </Field>
          <Field label="Reason (3+ characters)">
            <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
          </Field>
        </div>
        <Button type="submit" className={actionClass} disabled={pending}>
          Apply adjustment
        </Button>
        {done && (
          <p role="status" className="text-sm">
            {done}
          </p>
        )}
        <ErrorText>{error}</ErrorText>
      </form>
      <section className={panelClass}>
        <SectionTitle>Export</SectionTitle>
        <p className="text-sm text-muted-foreground">
          CSV files with scores only: no flags, answers or passwords.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/export?kind=leaderboard"
            className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            Download leaderboard CSV
          </a>
          <a
            href="/api/admin/export?kind=results"
            className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            Download results CSV
          </a>
        </div>
      </section>
    </>
  );
}
