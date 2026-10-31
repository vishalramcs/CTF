import Link from 'next/link';

import { formatPoints } from '@/components/leaderboard/format';
import type { BoardRow } from '@/lib/realtime/public-state';

// Top 5, plus this team's row when it is lower down. "You" is also in words, not only colour.
export function LeaderboardPreview({ rows, ownTeam }: { rows: BoardRow[]; ownTeam: string }) {
  const top = rows.slice(0, 5);
  const own = rows.find((r) => r.teamName === ownTeam);
  const shown = own && !top.includes(own) ? [...top, own] : top;

  return (
    <section aria-labelledby="preview" className="flex flex-col gap-3">
      <h2 id="preview" className="font-heading text-2xl font-bold uppercase">
        Leaderboard
      </h2>
      <table className="w-full text-left">
        <caption className="sr-only">Top five teams and your team</caption>
        <thead className="sr-only">
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={r.teamName}
              className={`border-b border-border ${r.teamName === ownTeam ? 'bg-secondary font-semibold' : ''}`}
            >
              <td className="py-2 pr-2 font-mono tabular-nums">#{r.rank}</td>
              <td className="py-2 pr-2">
                {r.teamName}
                {r.teamName === ownTeam && <span className="ml-2 text-sm text-ring">(you)</span>}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">{formatPoints(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link
        href="/leaderboard"
        className="inline-flex min-h-11 items-center text-sm text-ring underline underline-offset-4"
      >
        Full leaderboard
      </Link>
    </section>
  );
}
