'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import { tableClass, tdClass, thClass } from '@/components/admin/page-title';
import {
  actionClass,
  ConfirmModal,
  ErrorText,
  inputClass,
  Modal,
  textareaClass,
} from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { send } from '@/lib/admin/client';
import { formatTime } from '@/lib/admin/shared';
import type { TeamRow } from '@/lib/admin/teams';

type Credential = { team: string; password: string };
type SessionRow = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};
type Dialog =
  | { kind: 'create' }
  | { kind: 'credentials'; credentials: Credential[]; csv: string }
  | { kind: 'reset' | 'revoke' | 'deactivate' | 'rename' | 'sessions'; team: TeamRow }
  | { kind: 'new-password'; team: TeamRow; username: string; password: string };

function downloadCsv(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'credentials.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function TeamsPanel({
  teams,
  timeZone,
  maxSessions,
}: {
  teams: TeamRow[];
  timeZone: string;
  maxSessions: number;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>();
  const [error, setError] = useState<string>();
  const close = () => setDialog(undefined);

  async function patch(team: TeamRow, changes: Record<string, unknown>) {
    const result = await send('PATCH', `/api/admin/teams/${team.id}`, changes);
    if (!result.ok) return result.message;
    router.refresh();
  }

  async function toggle(team: TeamRow, changes: Record<string, unknown>) {
    setError(await patch(team, changes));
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button className={actionClass} onClick={() => setDialog({ kind: 'create' })}>
          Create teams
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Team</th>
              <th className={thClass}>Active</th>
              <th className={thClass}>Hidden</th>
              <th className={thClass}>Sessions</th>
              <th className={thClass}>Last seen</th>
              <th className={thClass}>Score</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <td className={tdClass}>
                  <Link href={`/admin/teams/${team.id}`} className="underline underline-offset-4">
                    {team.name}
                  </Link>
                </td>
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    aria-label={`${team.name} active`}
                    checked={team.isActive}
                    className="size-5"
                    onChange={() =>
                      team.isActive
                        ? setDialog({ kind: 'deactivate', team })
                        : toggle(team, { isActive: true })
                    }
                  />
                </td>
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    aria-label={`${team.name} hidden`}
                    checked={team.isHidden}
                    className="size-5"
                    onChange={() => toggle(team, { isHidden: !team.isHidden })}
                  />
                </td>
                <td className={`${tdClass} tabular-nums`}>
                  {team.activeSessions}/{maxSessions}
                </td>
                <td className={`${tdClass} whitespace-nowrap`}>
                  {formatTime(team.lastSeenAt, timeZone)}
                </td>
                <td className={`${tdClass} tabular-nums`}>{team.score}</td>
                <td className={tdClass}>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['sessions', 'View sessions'],
                        ['rename', 'Rename'],
                        ['revoke', 'Revoke sessions'],
                        ['reset', 'Reset password'],
                      ] as const
                    ).map(([kind, label]) => (
                      <Button
                        key={kind}
                        variant={kind === 'reset' ? 'destructive' : 'outline'}
                        className={actionClass}
                        onClick={() => setDialog({ kind, team })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}

      {dialog?.kind === 'create' && (
        <CreateTeamsModal
          onClose={close}
          onCreated={(credentials, csv) => {
            setDialog({ kind: 'credentials', credentials, csv });
            router.refresh();
          }}
        />
      )}

      {dialog?.kind === 'credentials' && (
        <Modal title="Team credentials" locked onClose={close}>
          <p role="alert" className="font-medium">
            Shown once. Download the CSV now.
          </p>
          <div className="max-h-80 overflow-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Team</th>
                  <th className={thClass}>Password</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {dialog.credentials.map((c) => (
                  <tr key={c.team}>
                    <td className={tdClass}>{c.team}</td>
                    <td className={tdClass}>{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className={actionClass} onClick={close}>
              Close
            </Button>
            <Button className={actionClass} onClick={() => downloadCsv(dialog.csv)}>
              Download CSV
            </Button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'reset' && (
        <ConfirmModal
          title="Reset password"
          word={dialog.team.name}
          label="Reset password"
          onClose={close}
          onConfirm={async () => {
            const result = await send<{ username: string; password: string }>(
              'POST',
              `/api/admin/teams/${dialog.team.id}/reset-password`,
            );
            if (!result.ok) return result.message;
            setDialog({ kind: 'new-password', team: dialog.team, ...result.data });
            router.refresh();
          }}
        >
          {dialog.team.name} gets the password derived from its name again and all its devices are
          logged out.
        </ConfirmModal>
      )}

      {dialog?.kind === 'new-password' && (
        <Modal title="New password" locked onClose={close}>
          <p role="alert" className="font-medium">
            Shown once. Give it to {dialog.team.name} now.
          </p>
          <p className="font-mono text-base">
            {dialog.team.name} / {dialog.password}
          </p>
          <div className="flex justify-end">
            <Button className={actionClass} onClick={close}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'revoke' && (
        <ConfirmModal
          title="Revoke sessions"
          label="Revoke sessions"
          onClose={close}
          onConfirm={async () => {
            const result = await send('POST', `/api/admin/teams/${dialog.team.id}/revoke-sessions`);
            if (!result.ok) return result.message;
            close();
            router.refresh();
          }}
        >
          All devices of {dialog.team.name} are logged out. The password stays the same.
        </ConfirmModal>
      )}

      {dialog?.kind === 'deactivate' && (
        <ConfirmModal
          title="Deactivate team"
          label="Deactivate"
          onClose={close}
          onConfirm={async () => {
            const failure = await patch(dialog.team, { isActive: false });
            if (!failure) close();
            return failure;
          }}
        >
          {dialog.team.name} is logged out, can&apos;t log in, and leaves the public board.
        </ConfirmModal>
      )}

      {dialog?.kind === 'rename' && (
        <RenameModal
          team={dialog.team}
          onClose={close}
          onSave={async (name) => {
            const failure = await patch(dialog.team, { name });
            if (!failure) close();
            return failure;
          }}
        />
      )}

      {dialog?.kind === 'sessions' && (
        <SessionsModal team={dialog.team} timeZone={timeZone} onClose={close} />
      )}
    </>
  );
}

function CreateTeamsModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (credentials: Credential[], csv: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await send<{ credentials: Credential[]; csv: string }>(
      'POST',
      '/api/admin/teams',
      { text },
    );
    setPending(false);
    if (result.ok) onCreated(result.data.credentials, result.data.csv);
    else setError(result.message);
  }

  return (
    <Modal title="Create teams" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block font-medium">
          One team name per line. The team name is the login; the password is that name lowercased,
          without spaces, reversed.
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            required
            rows={10}
            maxLength={20_000}
            spellCheck={false}
            className={textareaClass}
          />
        </label>
        <label className="block font-medium">
          Or upload a CSV
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={readFile}
            className={inputClass}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className={actionClass} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className={actionClass} disabled={pending}>
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameModal({
  team,
  onClose,
  onSave,
}: {
  team: TeamRow;
  onClose: () => void;
  onSave: (name: string) => Promise<string | undefined>;
}) {
  const [name, setName] = useState(team.name);

  return (
    <ConfirmModal title="Rename team" label="Save" onClose={onClose} onConfirm={() => onSave(name)}>
      <label className="block font-medium text-foreground">
        Team name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={40}
          className={inputClass}
        />
      </label>
    </ConfirmModal>
  );
}

function SessionsModal({
  team,
  timeZone,
  onClose,
}: {
  team: TeamRow;
  timeZone: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<SessionRow[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetch(`/api/admin/teams/${team.id}/sessions`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setRows((await res.json()).sessions);
      })
      .catch(() => setError("Couldn't load the sessions. Try again."));
  }, [team.id]);

  return (
    <Modal title={`Sessions: ${team.name}`} onClose={onClose}>
      <ErrorText>{error}</ErrorText>
      {!rows && !error && <p role="status">Loading…</p>}
      {rows?.length === 0 && <p>No active sessions.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Device</th>
                <th className={thClass}>IP</th>
                <th className={thClass}>Created</th>
                <th className={thClass}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${tdClass} break-all`}>{row.userAgent ?? '—'}</td>
                  <td className={`${tdClass} font-mono`}>{row.ip ?? '—'}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {formatTime(row.createdAt, timeZone)}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {formatTime(row.lastSeenAt, timeZone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="outline" className={actionClass} onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
