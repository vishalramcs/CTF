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
import { DIFFICULTIES, formatTime, type Difficulty } from '@/lib/admin/shared';
import type { CoordinateConfig } from '@/lib/admin/coordinates';
import { fragmentId } from '@/lib/coordinates/fragments';

type Draft = { value: string; order: string; clue: string };

function FragmentPlan({ config }: { config: CoordinateConfig }) {
  const { run, pending, error } = useAction();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      config.questions.map((q) => [
        q.id,
        {
          value: q.fragmentValue ?? '',
          order: q.coordinateOrder?.toString() ?? '',
          clue: q.orderClue ?? '',
        },
      ]),
    ),
  );
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  function save(event: FormEvent) {
    event.preventDefault();
    const plan = config.questions
      .filter((q) => drafts[q.id].value.trim())
      .map((q) => ({
        challengeId: q.id,
        value: drafts[q.id].value,
        order: Number(drafts[q.id].order),
        orderClue: drafts[q.id].clue || null,
      }));
    return run('POST', '/api/admin/coordinates/fragments', { plan });
  }

  return (
    <form onSubmit={save} className={panelClass}>
      <SectionTitle>Fragments</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Fill in a value for exactly 6 regular questions: 2 Easy, 2 Medium and 2 Difficult. Give
        each one a slot from 1 to 6: 1 = Location 1 North, 2 = Location 1 South, 3 = Location 2
        North, 4 = Location 2 South, 5 = Location 3 North, 6 = Location 3 South. Any question can
        take any slot. Leave the others blank. Every team gets the same fragment. A flag template
        can embed it with the fragment placeholder. Clear all values to remove the plan.
      </p>
      <p role="status" className="text-sm">
        {config.assignedCount === 0
          ? 'No fragments assigned.'
          : config.planError
            ? `Saved plan is invalid: ${config.planError}`
            : 'Saved plan is valid (6 fragments, 3 locations).'}
      </p>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>#</th>
              <th className={thClass}>Level</th>
              <th className={thClass}>Fragment value</th>
              <th className={thClass}>Slot (1-6)</th>
              <th className={thClass}>Fragment</th>
              <th className={thClass}>Order clue</th>
            </tr>
          </thead>
          <tbody>
            {config.questions.map((q) => (
              <tr key={q.id}>
                <td className={tdClass}>
                  {q.number} {q.title}
                </td>
                <td className={tdClass}>{DIFFICULTIES[q.difficulty as Difficulty].label}</td>
                <td className={tdClass}>
                  <input
                    aria-label={`Fragment value for ${q.number}`}
                    className={inputClass}
                    maxLength={60}
                    value={drafts[q.id].value}
                    onChange={(e) => set(q.id, { value: e.target.value })}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    aria-label={`Slot for ${q.number}`}
                    className={inputClass}
                    type="number"
                    min={1}
                    max={6}
                    value={drafts[q.id].order}
                    onChange={(e) => set(q.id, { order: e.target.value })}
                  />
                </td>
                <td className={tdClass}>
                  {Number(drafts[q.id].order) >= 1 && Number(drafts[q.id].order) <= 6
                    ? fragmentId(Number(drafts[q.id].order))
                    : '-'}
                </td>
                <td className={tdClass}>
                  <input
                    aria-label={`Order clue for ${q.number}`}
                    className={inputClass}
                    maxLength={300}
                    value={drafts[q.id].clue}
                    onChange={(e) => set(q.id, { clue: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className={actionClass} disabled={pending}>
        Save fragments
      </Button>
    </form>
  );
}

// One row per fragment slot: which question carries it and whether its value is set.
function LocationsOverview({ config }: { config: CoordinateConfig }) {
  return (
    <section className={panelClass}>
      <SectionTitle>Locations and fragments</SectionTitle>
      <p className="text-sm text-muted-foreground">
        3 locations, each with a North and a South fragment: 6 fragments in all. Solving the Main
        Question gives a team all six.
      </p>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Fragment</th>
              <th className={thClass}>Question</th>
              <th className={thClass}>Level</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((slot) => {
              const q = config.questions.find((x) => x.coordinateOrder === slot);
              return (
                <tr key={slot}>
                  <td className={tdClass}>{fragmentId(slot)}</td>
                  <td className={tdClass}>{q ? `${q.number} ${q.title}` : 'Not assigned'}</td>
                  <td className={tdClass}>
                    {q ? DIFFICULTIES[q.difficulty as Difficulty].label : '-'}
                  </td>
                  <td className={tdClass}>{q?.fragmentValue ? 'Configured' : 'Missing'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinalCoordinates({ config }: { config: CoordinateConfig }) {
  const { run, pending, error } = useAction();
  const [rows, setRows] = useState(() =>
    [1, 2, 3].map((position) => {
      const c = config.final.find((f) => f.position === position);
      return { label: c?.label ?? '', value: c?.value ?? '' };
    }),
  );
  const patch = (i: number, p: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...p } : row)));

  return (
    <form
      className={panelClass}
      onSubmit={(e) => {
        e.preventDefault();
        return run('POST', '/api/admin/coordinates/final', { coordinates: rows });
      }}
    >
      <SectionTitle>Reconstructed locations</SectionTitle>
      <p className="text-sm text-muted-foreground">
        The text a team sees for a location once it holds both its North and South fragments, or
        all three once it solves the Main Question. Label is the place name, value is the full
        text, for example the latitude and longitude. All three are required.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-2">
          <Field label={`Location ${i + 1} label`}>
            <input
              className={inputClass}
              maxLength={40}
              value={row.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
          </Field>
          <Field label={`Location ${i + 1} value`}>
            <input
              className={inputClass}
              maxLength={200}
              required
              value={row.value}
              onChange={(e) => patch(i, { value: e.target.value })}
            />
          </Field>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className={actionClass} disabled={pending}>
        Save locations
      </Button>
    </form>
  );
}

function FinalAnswer({ hasAnswer }: { hasAnswer: boolean }) {
  const { run, pending, error } = useAction();
  const [answer, setAnswer] = useState('');
  return (
    <form
      className={panelClass}
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await run('POST', '/api/admin/coordinates/answer', { answer });
        if (result.ok) setAnswer('');
      }}
    >
      <SectionTitle>Final location answer</SectionTitle>
      <p role="status" className="text-sm">
        {hasAnswer ? 'An answer is set. It can not be shown again.' : 'No answer set yet.'}
      </p>
      <Field label="New answer" hint="Compared after lower-casing and removing punctuation.">
        <input
          className={inputClass}
          maxLength={200}
          required
          autoComplete="off"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className={actionClass} disabled={pending || !answer.trim()}>
        {hasAnswer ? 'Replace answer' : 'Set answer'}
      </Button>
    </form>
  );
}

export function CoordinatesPanel({
  config,
  timeZone,
}: {
  config: CoordinateConfig;
  timeZone: string;
}) {
  return (
    <>
      <section className={panelClass}>
        <SectionTitle>Winners</SectionTitle>
        <ul className="space-y-1 text-sm">
          <li>
            Coordinate winner:{' '}
            {config.winner
              ? `${config.winner.team} at ${formatTime(config.winner.at, timeZone)}`
              : 'none yet'}
          </li>
          <li>
            First to solve the Main Question:{' '}
            {config.mainFirst
              ? `${config.mainFirst.team} at ${formatTime(config.mainFirst.at, timeZone)}`
              : 'none yet'}
          </li>
        </ul>
        <Notice>The two races are tracked separately and can have different winners.</Notice>
      </section>
      <LocationsOverview config={config} />
      <FragmentPlan config={config} />
      <FinalCoordinates config={config} />
      <FinalAnswer hasAnswer={config.hasAnswer} />
    </>
  );
}
