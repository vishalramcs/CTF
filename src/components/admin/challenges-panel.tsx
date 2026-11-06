'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Field, Notice } from '@/components/admin/fields';
import { tableClass, tdClass, thClass } from '@/components/admin/page-title';
import {
  actionClass,
  ConfirmModal,
  ErrorText,
  inputClass,
  Modal,
  textareaClass,
} from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import type { LoadedChallenge } from '@/lib/admin/challenges';
import { DIFFICULTIES, GENERATOR_KEYS, LEVELS, type Difficulty } from '@/lib/admin/shared';
import { fragmentId } from '@/lib/coordinates/fragments';

type Row = Omit<LoadedChallenge, 'hints'>;
type TeamOption = { id: string; name: string };
type Dialog = { kind: 'form'; row?: Row } | { kind: 'tools' | 'delete'; row: Row };

const HINT_SEPARATOR = '\n---\n';

function Summary({ rows, slots }: { rows: Row[]; slots: Record<string, number> }) {
  const tiers = [
    { key: 'easy', label: 'Easy' },
    { key: 'medium', label: 'Medium' },
    { key: 'difficult', label: 'Difficult' },
  ];
  const bearing = Object.keys(slots).length;
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label="Configuration summary">
      {tiers.map(({ key, label }) => {
        const inTier = rows.filter((r) => r.difficulty === key);
        const withFragment = inTier.filter((r) => slots[r.id] !== undefined).length;
        const ok = inTier.length === 4 && withFragment === 2;
        return (
          <li key={key} className={ok ? '' : 'text-destructive'}>
            {label}: {inTier.length}/4 questions, {withFragment}/2 with a fragment
          </li>
        );
      })}
      <li>Main: {rows.filter((r) => r.difficulty === 'main_difficult').length}/1</li>
      <li className={bearing === 6 ? '' : 'text-destructive'}>Fragments: {bearing}/6</li>
      <li>Locations: 3</li>
    </ul>
  );
}

export function ChallengesPanel({
  rows,
  teams,
  slots,
  workspaces,
}: {
  rows: Row[];
  teams: TeamOption[];
  slots: Record<string, number>;
  workspaces: string[];
}) {
  const [dialog, setDialog] = useState<Dialog>();
  const { run, error } = useAction();
  const close = () => setDialog(undefined);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button className={actionClass} onClick={() => setDialog({ kind: 'form' })}>
          Create challenge
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
      <Summary rows={rows} slots={slots} />
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>#</th>
              <th className={thClass}>Title</th>
              <th className={thClass}>Level</th>
              <th className={thClass}>Base</th>
              <th className={thClass}>Fragment</th>
              <th className={thClass}>Flag</th>
              <th className={thClass}>Version</th>
              <th className={thClass}>Published</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={tdClass}>{row.number}</td>
                <td className={tdClass}>{row.title}</td>
                <td className={tdClass}>{DIFFICULTIES[row.difficulty as Difficulty].label}</td>
                <td className={tdClass}>{row.basePoints}</td>
                <td className={tdClass}>
                  {slots[row.id] === undefined ? '-' : fragmentId(slots[row.id])}
                </td>
                <td className={tdClass}>
                  {row.flagMode === 'static' ? 'Static (shared)' : 'Per team'}
                </td>
                <td className={tdClass}>{row.generatorVersion}</td>
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    aria-label={`${row.title} published`}
                    checked={row.isPublished}
                    className="size-5"
                    onChange={() =>
                      run('PATCH', `/api/admin/challenges/${row.id}`, {
                        isPublished: !row.isPublished,
                      })
                    }
                  />
                </td>
                <td className={tdClass}>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="outline"
                      className={actionClass}
                      onClick={() => setDialog({ kind: 'form', row })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className={actionClass}
                      onClick={() => setDialog({ kind: 'tools', row })}
                    >
                      Test and preview
                    </Button>
                    <Button
                      variant="destructive"
                      className={actionClass}
                      onClick={() => setDialog({ kind: 'delete', row })}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No challenges yet.</p>}

      {dialog?.kind === 'form' && (
        <ChallengeForm row={dialog.row} workspaces={workspaces} onClose={close} />
      )}
      {dialog?.kind === 'tools' && <ToolsModal row={dialog.row} teams={teams} onClose={close} />}
      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title="Delete challenge"
          label="Delete"
          onClose={close}
          onConfirm={async () => {
            const result = await run('DELETE', `/api/admin/challenges/${dialog.row.id}`);
            if (result.ok) close();
            else return result.message;
          }}
        >
          Deletes #{dialog.row.number} {dialog.row.title}. A challenge that teams have solved can
          only be unpublished.
        </ConfirmModal>
      )}
    </>
  );
}

function parseJson(text: string, label: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(text || 'null') };
  } catch {
    return { error: `${label} is not valid JSON.` };
  }
}

function ChallengeForm({
  row,
  workspaces,
  onClose,
}: {
  row?: Row;
  workspaces: string[];
  onClose: () => void;
}) {
  const { run, pending, error } = useAction();
  const [formError, setFormError] = useState<string>();
  const [loaded, setLoaded] = useState<LoadedChallenge>();
  const [loadError, setLoadError] = useState<string>();
  const [difficulty, setDifficulty] = useState<Difficulty>(
    (row?.difficulty as Difficulty) ?? 'easy',
  );
  const [basePoints, setBasePoints] = useState(String(row?.basePoints ?? DIFFICULTIES.easy.base));
  const [flagMode, setFlagMode] = useState<'team' | 'static'>('team');

  useEffect(() => {
    if (!row) return;
    fetch(`/api/admin/challenges/${row.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setLoaded((await res.json()).challenge);
      })
      .catch(() => setLoadError("Couldn't load the challenge. Close and try again."));
  }, [row]);

  const ready = !row || loaded;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const f = new FormData(event.currentTarget);
    const text = (name: string) => String(f.get(name) ?? '');
    const evidence = parseJson(text('evidence'), 'Evidence');
    const config = parseJson(text('generatorConfig'), 'Generator config');
    if (evidence.error || config.error) return setFormError(evidence.error ?? config.error);
    // The dropdown wins over any workspace typed in the JSON box.
    const generatorConfig: Record<string, unknown> = { ...(config.value ?? {}) };
    delete generatorConfig.workspace;
    if (text('workspace')) generatorConfig.workspace = text('workspace');

    const fields = {
      number: Number(text('number')),
      title: text('title'),
      difficulty,
      category: text('category'),
      basePoints: Number(basePoints),
      storyMd: text('storyMd'),
      questionTemplate: text('questionTemplate'),
      evidence: evidence.value ?? [],
      generatorKey: text('generatorKey'),
      generatorConfig,
      hints: text('hints')
        .split(HINT_SEPARATOR.trim())
        .map((h) => h.trim())
        .filter(Boolean),
      isPublished: f.get('isPublished') === 'on',
    };
    const result = row
      ? await run('PATCH', `/api/admin/challenges/${row.id}`, fields)
      : await run<{ id: string }>('POST', '/api/admin/challenges', {
          fields,
          flagTemplate: text('flagTemplate'),
        });
    if (!result.ok) return;
    // A new static challenge is created per-team first, then switched, so the flag is hashed server-side.
    if (!row && flagMode === 'static') {
      const created = result as { ok: true; data: { id: string } };
      const flagResult = await run('POST', `/api/admin/challenges/${created.data.id}/flag`, {
        mode: 'static',
        flag: text('staticFlag'),
      });
      if (!flagResult.ok) return;
    }
    onClose();
  }

  return (
    <Modal title={row ? `Edit #${row.number}` : 'Create challenge'} onClose={onClose}>
      <ErrorText>{loadError}</ErrorText>
      {!ready && !loadError && <p role="status">Loading…</p>}
      {ready && !loadError && (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number (1-4 Easy, 5-8 Medium, 9-12 Difficult, 13 Main)">
              <input
                name="number"
                type="number"
                min={1}
                max={13}
                required
                defaultValue={row?.number}
                className={inputClass}
              />
            </Field>
            <Field label="Title">
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={row?.title}
                className={inputClass}
              />
            </Field>
            <Field label="Difficulty">
              <select
                value={difficulty}
                onChange={(e) => {
                  const next = e.target.value as Difficulty;
                  setDifficulty(next);
                  if (!row) setBasePoints(String(DIFFICULTIES[next].base));
                }}
                className={inputClass}
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {DIFFICULTIES[level].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Base points" hint="Defaults: 50 / 75 / 100 / 200.">
              <input
                type="number"
                min={1}
                required
                value={basePoints}
                onChange={(e) => setBasePoints(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Category">
              <input
                name="category"
                required
                maxLength={40}
                defaultValue={row?.category}
                className={inputClass}
              />
            </Field>
            <Field label="Generator">
              <select
                name="generatorKey"
                defaultValue={row?.generatorKey ?? 'template'}
                className={inputClass}
              >
                {GENERATOR_KEYS.map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </Field>
            <Field label="Workspace" hint="The files folder shown on the question page.">
              <select
                name="workspace"
                defaultValue={
                  ((row?.generatorConfig as { workspace?: string } | undefined)?.workspace ??
                    '') as string
                }
                className={inputClass}
              >
                <option value="">None</option>
                {workspaces.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Story (Markdown)">
            <textarea
              name="storyMd"
              rows={4}
              defaultValue={row?.storyMd}
              className={textareaClass}
            />
          </Field>
          <Field
            label="Question template"
            hint="Variant inputs: changing this bumps the generator version."
          >
            <textarea
              name="questionTemplate"
              rows={6}
              defaultValue={row?.questionTemplate}
              className={textareaClass}
            />
          </Field>
          <Field label="Evidence (JSON array)">
            <textarea
              name="evidence"
              rows={4}
              defaultValue={JSON.stringify(row?.evidence ?? [], null, 2)}
              className={textareaClass}
            />
          </Field>
          <Field label="Generator config (JSON object)">
            <textarea
              name="generatorConfig"
              rows={4}
              defaultValue={JSON.stringify(row?.generatorConfig ?? {}, null, 2)}
              className={textareaClass}
            />
          </Field>
          <Field label="Hints" hint="Separate hints with a line containing only ---.">
            <textarea
              name="hints"
              rows={4}
              defaultValue={loaded?.hints.join(HINT_SEPARATOR)}
              className={textareaClass}
            />
          </Field>
          <label className="flex items-center gap-2 font-medium">
            <input
              name="isPublished"
              type="checkbox"
              defaultChecked={row?.isPublished}
              className="size-5"
            />
            Published
          </label>

          {!row && (
            <fieldset className="space-y-3 rounded-md border border-border p-3">
              <legend className="px-1 font-medium">Flag</legend>
              <div className="flex gap-4">
                {(['team', 'static'] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={flagMode === mode}
                      onChange={() => setFlagMode(mode)}
                      className="size-5"
                    />
                    {mode === 'team' ? 'Per team' : 'Static'}
                  </label>
                ))}
              </div>
              {flagMode === 'team' ? (
                <Field label="Flag template" hint="Must contain {{token}}.">
                  <input
                    name="flagTemplate"
                    required
                    defaultValue="{{token}}"
                    className={inputClass}
                  />
                </Field>
              ) : (
                <>
                  <Notice tone="warn">
                    A static flag is the same for every team, so teams can share it.
                  </Notice>
                  <input type="hidden" name="flagTemplate" value="{{token}}" />
                  <Field label="Static flag">
                    <input name="staticFlag" required autoComplete="off" className={inputClass} />
                  </Field>
                </>
              )}
            </fieldset>
          )}
          {row && <FlagSection row={row} />}
          <ErrorText>{formError ?? error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className={actionClass} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className={actionClass} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// Its own buttons: the flag is hashed on the server and never read back.
function FlagSection({ row }: { row: Row }) {
  const { run, pending, error } = useAction();
  const [mode, setMode] = useState<'team' | 'static'>(
    row.flagMode === 'static' ? 'static' : 'team',
  );
  const [value, setValue] = useState(row.flagTemplate ?? '{{token}}');
  const [saved, setSaved] = useState(false);

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 font-medium">Flag (saved separately)</legend>
      <div className="flex gap-4">
        {(['team', 'static'] as const).map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === m}
              onChange={() => {
                setMode(m);
                setValue(m === 'team' ? '{{token}}' : '');
              }}
              className="size-5"
            />
            {m === 'team' ? 'Per team' : 'Static'}
          </label>
        ))}
      </div>
      {mode === 'static' && (
        <Notice tone="warn">
          A static flag is the same for every team, so teams can share it.
        </Notice>
      )}
      <Field
        label={
          mode === 'team' ? 'Flag template (needs {{token}})' : 'Static flag (never shown again)'
        }
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      <Button
        type="button"
        variant="outline"
        className={actionClass}
        disabled={pending}
        onClick={async () => {
          const result = await run(
            'POST',
            `/api/admin/challenges/${row.id}/flag`,
            mode === 'team' ? { mode, template: value } : { mode, flag: value },
          );
          setSaved(result.ok);
          if (result.ok && mode === 'static') setValue('');
        }}
      >
        Save flag
      </Button>
      {saved && (
        <p role="status" className="text-sm">
          Flag saved. Regenerate variants to apply it.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </fieldset>
  );
}

function ToolsModal({
  row,
  teams,
  onClose,
}: {
  row: Row;
  teams: TeamOption[];
  onClose: () => void;
}) {
  const { run, pending, error } = useAction();
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [flag, setFlag] = useState('');
  const [output, setOutput] = useState<string>();

  async function test(event: FormEvent) {
    event.preventDefault();
    const result = await run<{ match: boolean; malformed: boolean; stale: boolean }>(
      'POST',
      `/api/admin/challenges/${row.id}/test-flag`,
      { teamId, flag },
    );
    if (result.ok) {
      const { match, malformed, stale } = result.data;
      setOutput(
        `${malformed ? 'Malformed flag. ' : match ? 'Correct. ' : 'Wrong. '}${stale ? 'This team variant is stale: regenerate.' : ''}`,
      );
    }
  }

  async function preview() {
    const res = await fetch(`/api/admin/challenges/${row.id}/preview?team=${teamId}`);
    const data = await res.json().catch(() => ({}));
    setOutput(res.ok ? JSON.stringify(data, null, 2) : (data.error?.message ?? 'Preview failed.'));
  }

  return (
    <Modal title={`#${row.number} ${row.title}`} onClose={onClose}>
      <Field label="Team">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputClass}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <form onSubmit={test} className="space-y-2">
        <Field
          label="Test a flag"
          hint="Checked against this team's variant. It is not logged as a submission."
        >
          <input
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            autoComplete="off"
            className={inputClass}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="outline"
            className={actionClass}
            disabled={pending || !teamId}
          >
            Test flag
          </Button>
          <Button
            type="button"
            variant="outline"
            className={actionClass}
            disabled={!teamId}
            onClick={preview}
          >
            Preview this team&apos;s variant
          </Button>
          <Button
            type="button"
            variant="outline"
            className={actionClass}
            disabled={pending}
            onClick={async () => {
              const result = await run<{ regenerated: number }>(
                'POST',
                `/api/admin/challenges/${row.id}/regenerate`,
              );
              if (result.ok) setOutput(`Regenerated ${result.data.regenerated} variants.`);
            }}
          >
            Regenerate variants
          </Button>
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
      {output && (
        <pre
          role="status"
          className="max-h-80 overflow-auto rounded-md bg-secondary p-3 text-xs whitespace-pre-wrap"
        >
          {output}
        </pre>
      )}
      <div className="flex justify-end">
        <Button variant="outline" className={actionClass} onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
