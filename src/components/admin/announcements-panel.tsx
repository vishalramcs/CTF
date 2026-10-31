'use client';

import { useState, type FormEvent } from 'react';

import { Field } from '@/components/admin/fields';
import { panelClass } from '@/components/admin/page-title';
import { actionClass, ErrorText, textareaClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/admin/shared';

type Row = { id: string; message: string; createdAt: Date | string };

export function AnnouncementsPanel({ rows, timeZone }: { rows: Row[]; timeZone: string }) {
  const { run, pending, error } = useAction();
  const [message, setMessage] = useState('');

  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await run('POST', '/api/admin/announcements', { message });
    if (result.ok) setMessage('');
  }

  return (
    <>
      <form onSubmit={create} className={panelClass}>
        <Field label="New announcement" hint="Up to 500 characters. Teams see it right away.">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={500}
            rows={3}
            className={textareaClass}
          />
        </Field>
        <Button type="submit" className={actionClass} disabled={pending}>
          Publish
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`${panelClass} flex flex-wrap items-start justify-between gap-3`}
          >
            <div>
              <p className="whitespace-pre-wrap">{row.message}</p>
              <p className="text-sm text-muted-foreground">{formatTime(row.createdAt, timeZone)}</p>
            </div>
            <Button
              variant="destructive"
              className={actionClass}
              disabled={pending}
              onClick={() => run('DELETE', `/api/admin/announcements/${row.id}`)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No announcements.</p>}
    </>
  );
}
