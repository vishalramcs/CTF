'use client';

import { useEffect, useState } from 'react';

import {
  panelClass,
  SectionTitle,
  tableClass,
  tdClass,
  thClass,
} from '@/components/admin/page-title';
import { STATUS_LABELS } from '@/lib/admin/shared';
import type { Overview } from '@/lib/admin/overview';

// Polls every 15 s. R8 adds the realtime layer on top of this.
const POLL_MS = 15_000;

export function OverviewLive({ initial }: { initial: Overview }) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/overview', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        setData(await res.json());
        setStale(false);
      } catch {
        setStale(true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const { counts, event, board } = data;
  const facts: [string, string | number][] = [
    ['Event status', STATUS_LABELS[event.status as keyof typeof STATUS_LABELS]],
    ['Submissions', event.submissionsOpen ? 'Open' : 'Closed'],
    ['Leaderboard', event.leaderboardFrozen ? 'Frozen' : 'Live'],
    ['Teams', counts.teams],
    ['Active teams', counts.activeTeams],
    ['Online now', counts.onlineTeams],
    ['Total solves', counts.solves],
    ['Location discoveries', counts.locationDiscoveries],
    ['Keys collected', counts.keysCollected],
    ['Surprise completions', counts.surpriseCompletions],
  ];

  return (
    <>
      {stale && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t refresh. Showing the last data.
        </p>
      )}
      <dl className={`${panelClass} grid gap-4 space-y-0 sm:grid-cols-5`}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section className={panelClass}>
        <SectionTitle>Leaderboard</SectionTitle>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Rank</th>
                <th className={thClass}>Team</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Challenge</th>
                <th className={thClass}>Location</th>
                <th className={thClass}>Surprise</th>
                <th className={thClass}>Adjust</th>
                <th className={thClass}>Solves</th>
                <th className={thClass}>Visibility</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {board.map((row) => (
                <tr key={row.teamId}>
                  <td className={tdClass}>{row.rankAll}</td>
                  <td className={tdClass}>{row.teamName}</td>
                  <td className={tdClass}>{row.total}</td>
                  <td className={tdClass}>{row.challengePoints}</td>
                  <td className={tdClass}>{row.locationPoints}</td>
                  <td className={tdClass}>{row.surprisePoints}</td>
                  <td className={tdClass}>{row.adjustmentPoints}</td>
                  <td className={tdClass}>{row.solves}</td>
                  <td className={tdClass}>
                    {[!row.isActive && 'Inactive', row.isHidden && 'Hidden']
                      .filter(Boolean)
                      .join(', ') || 'Visible'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {board.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
      </section>
    </>
  );
}
