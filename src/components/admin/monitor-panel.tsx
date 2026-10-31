'use client';

import { useEffect, useState } from 'react';

import { Field } from '@/components/admin/fields';
import { tableClass, tdClass, thClass } from '@/components/admin/page-title';
import { ErrorText, inputClass } from '@/components/admin/ui';
import { formatTime } from '@/lib/admin/shared';

type Attempt = { kind: string; team: string; target: string; result: string; at: string };

const POLL_MS = 10_000;

export function MonitorPanel({
  teams,
  timeZone,
}: {
  teams: { id: string; name: string }[];
  timeZone: string;
}) {
  const [team, setTeam] = useState('');
  const [rows, setRows] = useState<Attempt[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const res = await fetch(`/api/admin/monitor${team ? `?team=${team}` : ''}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (live) {
          setRows(data.attempts);
          setError(undefined);
        }
      } catch {
        if (live) setError("Couldn't load attempts. Retrying.");
      }
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [team]);

  return (
    <>
      <div className="max-w-sm">
        <Field label="Team">
          <select value={team} onChange={(e) => setTeam(e.target.value)} className={inputClass}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {!rows && !error && <p role="status">Loading…</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Time</th>
                <th className={thClass}>Team</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Target</th>
                <th className={thClass}>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatTime(row.at, timeZone)}</td>
                  <td className={tdClass}>{row.team}</td>
                  <td className={tdClass}>{row.kind}</td>
                  <td className={tdClass}>{row.target}</td>
                  <td className={tdClass}>{row.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet.</p>}
        </div>
      )}
    </>
  );
}
