'use client';

import { useState, type FormEvent } from 'react';

import { Field, Notice } from '@/components/admin/fields';
import { panelClass, SectionTitle } from '@/components/admin/page-title';
import { actionClass, ErrorText, inputClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { DIFFICULTIES, type Difficulty } from '@/lib/admin/shared';
import type { loadLocations } from '@/lib/admin/locations';

type Location = Awaited<ReturnType<typeof loadLocations>>[number];

export function LocationsPanel({ locations }: { locations: Location[] }) {
  return (
    <>
      {locations.map((location) => (
        <LocationCard
          key={`${location.id}-${location.name}-${location.fragmentsRequired}`}
          location={location}
        />
      ))}
    </>
  );
}

function LocationCard({ location }: { location: Location }) {
  const { run, pending, error } = useAction();
  const [saved, setSaved] = useState(false);
  const [revealed, setRevealed] = useState<string>();
  const label = DIFFICULTIES[location.level as Difficulty].label;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const answer = String(f.get('answer') ?? '');
    const result = await run('PATCH', `/api/admin/locations/${location.level}`, {
      name: String(f.get('name')),
      fragmentsRequired: Number(f.get('fragmentsRequired')),
      ...(answer.trim() ? { answer } : {}),
    });
    setSaved(result.ok);
    if (result.ok) form.reset();
  }

  async function reveal() {
    const result = await run<{ answer: string }>(
      'POST',
      `/api/admin/locations/${location.level}/reveal`,
    );
    if (result.ok) setRevealed(result.data.answer);
  }

  return (
    <section className={panelClass} aria-label={`${label} location`}>
      <SectionTitle>{label} location</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Reward {location.rewardPoints} points (fixed by the rules). Answer:{' '}
        {location.hasAnswer ? 'set' : 'not set'}.
      </p>
      <form onSubmit={save} className="space-y-3">
        <Notice tone="warn">
          The location name is SENT TO TEAMS even while the location is locked. Never put the real
          place in it. Use a codename.
        </Notice>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name shown to teams">
            <input
              name="name"
              required
              maxLength={60}
              defaultValue={location.name}
              className={inputClass}
            />
          </Field>
          <Field label="Fragments required">
            <input
              name="fragmentsRequired"
              type="number"
              min={1}
              max={10}
              required
              defaultValue={location.fragmentsRequired}
              className={inputClass}
            />
          </Field>
          <Field label="Answer" hint="Leave blank to keep the current answer.">
            <input name="answer" autoComplete="off" maxLength={200} className={inputClass} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className={actionClass} disabled={pending}>
            Save location
          </Button>
          {location.hasAnswer && (
            <Button
              type="button"
              variant="outline"
              className={actionClass}
              disabled={pending}
              onClick={reveal}
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

      <h3 className="font-medium">Fragments on {label} challenges</h3>
      {location.challenges.length === 0 && (
        <p className="text-sm text-muted-foreground">No challenges at this level yet.</p>
      )}
      {location.challenges.map((challenge) => (
        <FragmentRow
          key={challenge.id}
          level={location.level}
          challenge={challenge}
          fragment={location.fragments.find((f) => f.challengeId === challenge.id)}
        />
      ))}
    </section>
  );
}

function FragmentRow({
  level,
  challenge,
  fragment,
}: {
  level: string;
  challenge: { id: string; number: number; title: string };
  fragment?: Location['fragments'][number];
}) {
  const { run, pending, error } = useAction();
  const [saved, setSaved] = useState(false);
  const name = `#${challenge.number} ${challenge.title}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const result = await run('POST', `/api/admin/locations/${level}/fragments`, {
      challengeId: challenge.id,
      label: String(f.get('label')),
      value: String(f.get('value')),
      orderClue: String(f.get('orderClue') ?? ''),
    });
    setSaved(result.ok);
  }

  return (
    <form onSubmit={save} className="space-y-2 rounded-md border border-border p-3">
      <p className="font-medium">{name}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Label (A, B...)">
          <input
            name="label"
            required
            maxLength={20}
            defaultValue={fragment?.label}
            className={inputClass}
          />
        </Field>
        <Field label="Value">
          <input
            name="value"
            required
            autoComplete="off"
            defaultValue={fragment?.value}
            className={inputClass}
          />
        </Field>
        <Field label="Order clue">
          <input
            name="orderClue"
            maxLength={500}
            defaultValue={fragment?.orderClue ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" className={actionClass} disabled={pending}>
          {fragment ? 'Update fragment' : 'Add fragment'}
        </Button>
        {fragment && (
          <Button
            type="button"
            variant="destructive"
            className={actionClass}
            disabled={pending}
            onClick={() =>
              run('DELETE', `/api/admin/locations/${level}/fragments`, {
                challengeId: challenge.id,
              })
            }
          >
            Remove
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          Saving regenerates this challenge&apos;s variants.
        </span>
        {saved && (
          <span role="status" className="text-sm">
            Saved.
          </span>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
