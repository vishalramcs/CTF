import Link from 'next/link';

import { AnimatedNumber } from '@/components/leaderboard/animated-number';
import { solvedCount } from '@/components/leaderboard/format';
import type { RankChange } from '@/hooks/use-rank-tracker';
import type { BoardRow } from '@/lib/realtime/public-state';

// Design Brief §4 metals. The rank is printed too, so colour is never the only cue.
const PODIUM: Record<number, { card: string; text: string; label: string }> = {
  1: { card: 'lb-gold', text: 'text-[#f4c542]', label: '1st' },
  2: { card: 'lb-silver', text: 'text-[#c9d1e0]', label: '2nd' },
  3: { card: 'lb-bronze', text: 'text-[#d08a4e]', label: '3rd' },
};

// ▲ and ▼ come from the movement the live board already reports, with the number in words too.
function Movement({ change }: { change?: RankChange }) {
  if (!change || change.positions === 0) return null;
  const up = change.positions > 0;
  const n = Math.abs(change.positions);
  return (
    <span className={`text-xs font-bold ${up ? 'text-success' : 'text-destructive'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'Up' : 'Down'} </span>
      {n}
      <span className="sr-only"> {n === 1 ? 'place' : 'places'}</span>
    </span>
  );
}

function PodiumCard({
  row,
  own,
  big,
  change,
}: {
  row: BoardRow;
  own: boolean;
  big: boolean;
  change?: RankChange;
}) {
  const metal = PODIUM[row.rank];
  return (
    <li
      aria-current={own ? 'true' : undefined}
      className={`dash-card flex flex-col gap-1 border ${metal.card} ${big ? 'p-4' : 'p-3'} ${
        own ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-heading font-black ${metal.text} ${big ? 'text-3xl' : 'text-xl'}`}>
          <span className="sr-only">Rank </span>
          {row.rank}
          <span className="ml-1 text-xs font-bold uppercase" aria-hidden>
            {metal.label.slice(1)}
          </span>
        </span>
        <Movement change={change} />
      </div>
      <span className={`truncate font-semibold ${big ? 'text-lg' : ''}`}>
        {row.teamName}
        {own && <span className="ml-2 text-xs uppercase">(you)</span>}
      </span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{solvedCount(row)} solved</span>
        <span className={`font-heading font-black tabular-nums ${big ? 'text-3xl' : 'text-xl'}`}>
          <AnimatedNumber value={row.total} />
          <span className="sr-only"> points</span>
        </span>
      </span>
    </li>
  );
}

function PlainRow({ row, own, change }: { row: BoardRow; own: boolean; change?: RankChange }) {
  return (
    <li
      aria-current={own ? 'true' : undefined}
      className={`flex items-center gap-3 rounded-lg border border-border bg-secondary/60 p-2 ${
        own ? 'bg-primary/15 ring-1 ring-primary' : ''
      }`}
    >
      <span className="w-8 shrink-0 font-heading text-lg font-black text-muted-foreground tabular-nums">
        <span className="sr-only">Rank </span>
        {row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {row.teamName}
        {own && <span className="ml-2 text-xs uppercase">(you)</span>}
      </span>
      <Movement change={change} />
      <span className="shrink-0 font-heading text-lg font-black tabular-nums">
        <AnimatedNumber value={row.total} />
        <span className="sr-only"> points</span>
      </span>
    </li>
  );
}

// The same rows the full board uses, just laid out for the dashboard: the top three as cards, then
// the next two, then this team if it is lower down. No ranking is calculated here.
export function LeaderboardPreview({
  rows,
  ownTeam,
  changes,
}: {
  rows: BoardRow[];
  ownTeam: string;
  changes?: ReadonlyMap<string, RankChange>;
}) {
  const podium = rows.filter((r) => r.rank <= 3).slice(0, 5);
  const next = rows.filter((r) => r.rank > 3).slice(0, 2);
  const own = rows.find((r) => r.teamName === ownTeam);
  const shownNames = new Set([...podium, ...next].map((r) => r.teamName));
  const extra = own && !shownNames.has(own.teamName) ? own : null;
  const first = podium.filter((r) => r.rank === 1);
  const rest = podium.filter((r) => r.rank !== 1);

  return (
    <section aria-labelledby="preview" className="flex flex-col gap-3">
      <h2 id="preview" className="font-heading text-2xl font-bold uppercase">
        Leaderboard
      </h2>
      <div className="dash-card dash-card--accent flex flex-col gap-3 p-3">
        {rows.length === 0 && <p className="text-muted-foreground">No scores yet.</p>}
        <ol aria-label="Top teams and your team" className="flex flex-col gap-2">
          {first.map((r) => (
            <PodiumCard
              key={r.teamName}
              row={r}
              own={r.teamName === ownTeam}
              big
              change={changes?.get(r.teamName)}
            />
          ))}
          {rest.length > 0 && (
            <li className="contents">
              <ol className="grid grid-cols-2 gap-2">
                {rest.map((r) => (
                  <PodiumCard
                    key={r.teamName}
                    row={r}
                    own={r.teamName === ownTeam}
                    big={false}
                    change={changes?.get(r.teamName)}
                  />
                ))}
              </ol>
            </li>
          )}
          {next.map((r) => (
            <PlainRow
              key={r.teamName}
              row={r}
              own={r.teamName === ownTeam}
              change={changes?.get(r.teamName)}
            />
          ))}
          {extra && (
            <>
              <li aria-hidden className="web-divider" />
              <PlainRow row={extra} own change={changes?.get(extra.teamName)} />
            </>
          )}
        </ol>
        <Link
          href="/leaderboard"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border text-sm font-semibold hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Full leaderboard
        </Link>
      </div>
    </section>
  );
}
