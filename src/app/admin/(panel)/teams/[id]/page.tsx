import { notFound } from 'next/navigation';

import {
  PageTitle,
  panelClass,
  SectionTitle,
  tableClass,
  tdClass,
  thClass,
} from '@/components/admin/page-title';
import { formatTime } from '@/lib/admin/shared';
import { loadTeamDetail } from '@/lib/admin/teams';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  // A non-UUID would make Postgres throw, so it is a 404 like an unknown team.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadTeamDetail(id);
  if (!detail) notFound();

  const { team, score, solved, failed, locations, keys, surprises } = detail;
  const tz = env.EVENT_TIMEZONE;
  const scores: [string, string][] = [
    ['Total', score.total],
    ['Challenge', score.challengePoints],
    ['Location', score.locationPoints],
    ['Surprise', score.surprisePoints],
    ['Adjustment', score.adjustmentPoints],
  ];

  return (
    <>
      <PageTitle>{team.name}</PageTitle>
      <p className="text-sm text-muted-foreground">
        {[!team.isActive && 'Inactive', team.isHidden && 'Hidden'].filter(Boolean).join(', ') ||
          'Active and visible'}
      </p>
      <dl className={`${panelClass} grid gap-4 space-y-0 sm:grid-cols-5`}>
        {scores.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">Score: {label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className={panelClass}>
        <SectionTitle>Solved challenges</SectionTitle>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Title</th>
                <th className={thClass}>Position</th>
                <th className={thClass}>Points</th>
                <th className={thClass}>Solved</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {solved.map((s) => (
                <tr key={s.number}>
                  <td className={tdClass}>{s.number}</td>
                  <td className={tdClass}>{s.title}</td>
                  <td className={tdClass}>{s.solve_position}</td>
                  <td className={tdClass}>{s.points_awarded}</td>
                  <td className={tdClass}>{formatTime(s.solved_at, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {solved.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      </section>

      <section className={panelClass}>
        <SectionTitle>Failed submissions (latest 100)</SectionTitle>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Submitted</th>
                <th className={thClass}>Result</th>
                <th className={thClass}>Time</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((f, i) => (
                <tr key={i}>
                  <td className={tdClass}>{f.number}</td>
                  <td className={`${tdClass} font-mono break-all`}>{f.submitted_preview ?? '—'}</td>
                  <td className={tdClass}>{f.result}</td>
                  <td className={tdClass}>{formatTime(f.submitted_at, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {failed.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
      </section>

      <section className={panelClass}>
        <SectionTitle>Locations, keys and surprises</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {locations.map((l) => (
            <li key={l.level}>
              Location {l.level} reached {formatTime(l.achieved_at, tz)}
            </li>
          ))}
          {keys.map((k) => (
            <li key={k.name}>
              {k.name} acquired {formatTime(k.acquired_at, tz)}
            </li>
          ))}
          {surprises.map((s) => (
            <li key={s.title}>
              {s.title}: discovered {formatTime(s.discovered_at, tz)},{' '}
              {s.completed_at ? `completed ${formatTime(s.completed_at, tz)}` : 'not completed'}
            </li>
          ))}
        </ul>
        {locations.length + keys.length + surprises.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        )}
      </section>
    </>
  );
}
