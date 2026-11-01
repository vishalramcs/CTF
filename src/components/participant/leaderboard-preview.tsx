import Link from 'next/link';

import { AnimatedNumber } from '@/components/leaderboard/animated-number';
import { solvedCount } from '@/components/leaderboard/format';
import type { BoardRow } from '@/lib/realtime/public-state';

// Design Brief §4 metals, by rank: the rank is printed too, so colour is never the only cue.
const METAL: Record<number, string> = {
  1: 'border-l-[#f4c542] text-[#f4c542]',
  2: 'border-l-[#c9d1e0] text-[#c9d1e0]',
  3: 'border-l-[#d08a4e] text-[#d08a4e]',
};

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
      <div className="mission-panel flex flex-col gap-2 rounded-lg p-3">
        <ol aria-label="Top five teams and your team" className="flex flex-col gap-2">
          {shown.map((r) => {
            const isOwn = r.teamName === ownTeam;
            const metal = METAL[r.rank] ?? 'border-l-border text-muted-foreground';
            return (
              <li
                key={r.teamName}
                aria-current={isOwn ? 'true' : undefined}
                className={`flex items-center gap-3 rounded-md border-l-4 p-2 ${metal} ${
                  isOwn ? 'bg-primary/15 ring-1 ring-primary' : 'bg-secondary'
                }`}
              >
                <span className="w-8 shrink-0 font-heading text-xl font-black tabular-nums">
                  <span className="sr-only">Rank </span>
                  {r.rank}
                </span>
                <span className="min-w-0 flex-1 text-foreground">
                  <span className="block truncate font-semibold">
                    {r.teamName}
                    {isOwn && <span className="ml-2 text-xs uppercase">(you)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {solvedCount(r)} solved
                  </span>
                </span>
                <span className="shrink-0 font-heading text-xl font-black text-foreground tabular-nums">
                  <AnimatedNumber value={r.total} />
                  <span className="sr-only"> points</span>
                </span>
              </li>
            );
          })}
        </ol>
        <Link
          href="/leaderboard"
          className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border text-sm font-semibold hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Full leaderboard
        </Link>
      </div>
    </section>
  );
}
