import { formatPoints } from '@/components/leaderboard/format';
import type { BoardRow } from '@/lib/realtime/public-state';

// Design Brief §4: gold, silver, bronze. The rank number and metal name are printed too.
const METAL = [
  { name: 'Gold', color: 'text-[#f4c542] border-[#f4c542]' },
  { name: 'Silver', color: 'text-[#c9d1e0] border-[#c9d1e0]' },
  { name: 'Bronze', color: 'text-[#d08a4e] border-[#d08a4e]' },
];

export function Podium({
  rows,
  ownTeam,
  large,
}: {
  rows: BoardRow[];
  ownTeam?: string;
  large?: boolean;
}) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Top three teams">
      {top.map((row, i) => (
        <li
          key={row.teamName}
          className={`flex flex-col gap-1 rounded-lg border-2 bg-card p-4 ${METAL[i].color} ${
            row.teamName === ownTeam ? 'ring-2 ring-ring' : ''
          }`}
        >
          <span className={`font-mono uppercase ${large ? 'text-lg' : 'text-sm'}`}>
            #{row.rank} {METAL[i].name}
          </span>
          <span
            className={`truncate font-heading font-black uppercase text-foreground ${
              large ? 'text-4xl' : 'text-xl'
            }`}
          >
            {row.teamName}
            {row.teamName === ownTeam && <span className="sr-only"> (your team)</span>}
          </span>
          <span className={`font-bold tabular-nums ${large ? 'text-5xl' : 'text-2xl'}`}>
            {formatPoints(row.total)}
            <span className="sr-only"> points</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
