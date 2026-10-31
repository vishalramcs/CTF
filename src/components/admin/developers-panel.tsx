'use client';

import { useState, type FormEvent } from 'react';

import { Field } from '@/components/admin/fields';
import { panelClass, SectionTitle } from '@/components/admin/page-title';
import { actionClass, ConfirmModal, ErrorText, inputClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';

type Developer = { id: string; username: string };

export function DevelopersPanel({ developers }: { developers: Developer[] }) {
  const { run, pending, error } = useAction();
  const [removing, setRemoving] = useState<Developer>();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const result = await run('POST', '/api/admin/developers', {
      username: String(f.get('username')),
      password: String(f.get('password')),
    });
    if (result.ok) form.reset();
  }

  return (
    <>
      <form onSubmit={add} className={panelClass}>
        <SectionTitle>Add a developer</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username">
            <input
              name="username"
              required
              minLength={2}
              maxLength={64}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field label="Password (12+ characters)">
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </div>
        <Button type="submit" className={actionClass} disabled={pending}>
          Add developer
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
      <ul className="space-y-2">
        {developers.map((d) => (
          <li key={d.id} className={`${panelClass} flex items-center justify-between gap-3`}>
            <span className="font-mono">{d.username}</span>
            <Button variant="destructive" className={actionClass} onClick={() => setRemoving(d)}>
              Remove access
            </Button>
          </li>
        ))}
      </ul>
      {developers.length === 0 && <p className="text-sm text-muted-foreground">No developers.</p>}
      {removing && (
        <ConfirmModal
          title="Remove developer"
          label="Remove"
          onClose={() => setRemoving(undefined)}
          onConfirm={async () => {
            const result = await run('DELETE', `/api/admin/developers/${removing.id}`);
            if (result.ok) setRemoving(undefined);
            else return result.message;
          }}
        >
          {removing.username} loses access and is logged out.
        </ConfirmModal>
      )}
    </>
  );
}
