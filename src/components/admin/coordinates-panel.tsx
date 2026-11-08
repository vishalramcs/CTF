'use client';

import { useState, type FormEvent } from 'react';

import { Field } from '@/components/admin/fields';
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
import { DIFFICULTIES, type Difficulty } from '@/lib/admin/shared';
import type { CoordinateConfig } from '@/lib/admin/coordinates';
import { fragmentId } from '@/lib/coordinates/fragments';

const SLOTS = [1, 2, 3, 4, 5, 6];
const SIDE = (slot: number) => (slot % 2 === 1 ? 'North' : 'South');

type Row = { challengeId: string; value: string };

// docs/11. One row per fragment: the admin picks which question carries it and types the
// coordinate. A team sees it after solving that question, or all six after the Main Question.
function AssignCoordinates({ config }: { config: CoordinateConfig }) {
  const { run, pending, error } = useAction();
  const [rows, setRows] = useState<Row[]>(() =>
    SLOTS.map((slot) => {
      const q = config.questions.find((x) => x.coordinateOrder === slot);
      return { challengeId: q?.id ?? '', value: q?.fragmentValue ?? '' };
    }),
  );
  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const used = rows.map((r) => r.challengeId).filter(Boolean);
  const duplicate = used.length !== new Set(used).size;

  function save(event: FormEvent) {
    event.preventDefault();
    const filled = rows
      .map((r, i) => ({ ...r, order: i + 1 }))
      .filter((r) => r.challengeId && r.value.trim());
    const plan = filled.map((r) => ({
      challengeId: r.challengeId,
      value: r.value,
      order: r.order,
      orderClue: null,
    }));
    return run('POST', '/api/admin/coordinates/fragments', { plan });
  }

  return (
    <form onSubmit={save} className={panelClass}>
      <SectionTitle>Assign coordinates to questions</SectionTitle>
      <p className="text-sm text-muted-foreground">
        6 coordinates, 2 per location (North and South). Pick the question that gives each one and
        type the coordinate. Use 2 Easy, 2 Medium and 2 Difficult questions. When a team solves that
        question it sees the coordinate on its question page and in its Locations box. Solving the
        Main Question gives all six.
      </p>
      <p role="status" className="text-sm">
        {config.assignedCount === 0
          ? 'Nothing saved yet.'
          : config.planError
            ? `Saved setup has a problem: ${config.planError}`
            : '✓ Saved: 6 coordinates on 6 questions.'}
      </p>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Location</th>
              <th className={thClass}>Part</th>
              <th className={thClass}>Question</th>
              <th className={thClass}>Coordinate</th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot, i) => (
              <tr key={slot}>
                <td className={tdClass}>
                  {Math.ceil(slot / 2)}
                  <span className="ml-1 text-xs text-muted-foreground">({fragmentId(slot)})</span>
                </td>
                <td className={tdClass}>{SIDE(slot)}</td>
                <td className={tdClass}>
                  <select
                    aria-label={`Question for ${fragmentId(slot)}`}
                    className={inputClass}
                    value={rows[i].challengeId}
                    onChange={(e) => set(i, { challengeId: e.target.value })}
                  >
                    <option value="">Choose a question</option>
                    {config.questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        Q{q.number} · {DIFFICULTIES[q.difficulty as Difficulty].label} · {q.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={tdClass}>
                  <input
                    aria-label={`Coordinate for ${fragmentId(slot)}`}
                    className={inputClass}
                    maxLength={60}
                    placeholder="e.g. 40.7128° N"
                    value={rows[i].value}
                    onChange={(e) => set(i, { value: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {duplicate && (
        <p role="alert" className="text-sm text-destructive">
          A question is picked twice. Each question can carry one coordinate.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className={actionClass} disabled={pending || duplicate}>
        Save coordinates
      </Button>
    </form>
  );
}

function LocationNames({ config }: { config: CoordinateConfig }) {
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
      <SectionTitle>Location names</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Shown to a team once it has both coordinates of a location.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-2">
          <Field label={`Location ${i + 1} name`}>
            <input
              className={inputClass}
              maxLength={60}
              value={row.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
          </Field>
          <Field label={`Location ${i + 1} full text`}>
            <textarea
              className={inputClass}
              maxLength={200}
              rows={2}
              required
              value={row.value}
              onChange={(e) => patch(i, { value: e.target.value })}
            />
          </Field>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className={actionClass} disabled={pending}>
        Save location names
      </Button>
    </form>
  );
}

// docs/13. The final step: what a team holding all six fragments sees, the accepted answers and the
// bonus. Saved answers are never sent back here; leaving the box empty keeps them.
function SpaceSignal({ config }: { config: CoordinateConfig }) {
  const { run, pending, error } = useAction();
  const [signal, setSignal] = useState(config.finalSignal);
  const [answers, setAnswers] = useState('');
  const [points, setPoints] = useState(String(config.finalPoints));

  return (
    <form
      className={panelClass}
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await run('POST', '/api/admin/coordinates/signal', {
          signal,
          answers,
          points: Number(points),
        });
        if (result.ok) setAnswers('');
      }}
    >
      <SectionTitle>Space signal (final race)</SectionTitle>
      <p className="text-sm text-muted-foreground">
        A team that holds all six coordinates sees this text and can download the celestial
        catalogue. The first real team to name the object wins the race; every team that names it
        gets the bonus once.
      </p>
      <p role="status" className="text-sm">
        {config.hasAnswer
          ? `✓ ${Math.max(config.answerCount, 1)} accepted answer(s) saved.`
          : 'No answer saved yet: the signal stays hidden until one is.'}{' '}
        {config.winner ? `Winner: ${config.winner.team}.` : 'No winner yet.'}
      </p>
      <Field label="Signal text (shown at 6/6)">
        <textarea
          className={inputClass}
          maxLength={600}
          rows={4}
          placeholder="Right Ascension: … / Declination: … / Distance: …"
          value={signal}
          onChange={(e) => setSignal(e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="Accepted answers, one per line (empty keeps the saved ones)">
          <textarea
            className={inputClass}
            maxLength={400}
            rows={2}
            autoComplete="off"
            value={answers}
            onChange={(e) => setAnswers(e.target.value)}
          />
        </Field>
        <Field label="Bonus points">
          <input
            type="number"
            min={0}
            max={1000}
            className={inputClass}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className={actionClass} disabled={pending}>
        Save space signal
      </Button>
    </form>
  );
}

export function CoordinatesPanel({ config }: { config: CoordinateConfig; timeZone?: string }) {
  return (
    <>
      <AssignCoordinates config={config} />
      <LocationNames config={config} />
      <SpaceSignal config={config} />
    </>
  );
}
