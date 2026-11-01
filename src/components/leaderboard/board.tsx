'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { AnimatedNumber, PointsFloat } from '@/components/leaderboard/animated-number';
import { solvedCount } from '@/components/leaderboard/format';
import type { RankChange } from '@/hooks/use-rank-tracker';
import type { BoardRow } from '@/lib/realtime/public-state';

const FLIP_MS = 250;
const PULSE_MS = 1_400;
const TOP_TEN = 10;
const METAL_EDGE = ['border-l-[#f4c542]', 'border-l-[#c9d1e0]', 'border-l-[#d08a4e]'];

type Filter = 'all' | 'top' | 'mine';

function RankChangeCell({ change }: { change?: RankChange }) {
  if (!change || change.positions === 0) {
    return (
      <span className="text-muted-foreground">
        —<span className="sr-only">no change</span>
      </span>
    );
  }
  const up = change.positions > 0;
  return (
    <span className={`font-bold whitespace-nowrap ${up ? 'text-[#7da7ff]' : 'text-[#ff6b70]'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span>{' '}
      <span className="sr-only">{up ? 'Up' : 'Down'} </span>
      {Math.abs(change.positions)}
      <span className="ml-1 text-xs font-normal text-muted-foreground">
        was #{change.previousRank}
      </span>
    </span>
  );
}

export function Board({
  rows,
  ownTeam,
  large,
  changes,
  version,
}: {
  rows: BoardRow[];
  ownTeam?: string;
  large?: boolean;
  changes?: ReadonlyMap<string, RankChange>;
  version?: number;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const tops = useRef(new Map<string, number>());
  // Each ping refetches twice and a filter re-renders: a move pulses once, for its version.
  const pulsed = useRef(new Map<string, number | undefined>());

  const shown =
    filter === 'top'
      ? rows.slice(0, TOP_TEN)
      : filter === 'mine'
        ? rows.filter((row) => row.teamName === ownTeam)
        : rows;

  // FLIP: measure after render, play the move from the old position. Skipped for reduced motion.
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    rowEls.current.forEach((el, team) => {
      const top = el.getBoundingClientRect().top;
      next.set(team, top);
      if (reduce) return;
      const before = tops.current.get(team);
      if (before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: FLIP_MS,
          easing: 'ease-out',
        });
      }
      const change = changes?.get(team);
      if (change && change.v === version && pulsed.current.get(team) !== version) {
        pulsed.current.set(team, version);
        const color = change.positions < 0 || change.points < 0 ? '226 35 42' : '45 107 255';
        el.animate(
          [{ backgroundColor: `rgb(${color} / 0.4)` }, { backgroundColor: 'rgb(0 0 0 / 0)' }],
          { duration: PULSE_MS, easing: 'ease-out' },
        );
      }
    });
    tops.current = next;
  }, [shown, version, changes]);

  if (rows.length === 0) return <p className="text-muted-foreground">No teams on the board yet.</p>;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All teams' },
    { id: 'top', label: 'Top 10' },
    ...(ownTeam ? [{ id: 'mine' as const, label: 'My team' }] : []),
  ];
  const cell = large ? 'px-3 py-3' : 'px-2 py-2';
  const num = `${cell} text-right tabular-nums`;
  return (
    <div className="flex flex-col gap-3">
      {!large && (
        <div role="group" aria-label="Filter teams" className="flex flex-wrap gap-1">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className="min-h-11 rounded-sm border border-border px-3 text-sm font-semibold hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-primary/20"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse ${large ? 'text-2xl' : 'text-sm'}`}>
          <caption className="sr-only">Leaderboard</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground uppercase">
              <th scope="col" className={cell}>
                Rank
              </th>
              <th scope="col" className={cell}>
                Team
              </th>
              <th scope="col" className={num}>
                Score
              </th>
              <th scope="col" className={cell}>
                Challenges solved
              </th>
              <th scope="col" className={cell}>
                Rank change
              </th>
              <th scope="col" className={cell}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const own = row.teamName === ownTeam;
              const change = changes?.get(row.teamName);
              const place = rows.indexOf(row);
              return (
                <tr
                  key={row.teamName}
                  ref={(el) => {
                    if (el) rowEls.current.set(row.teamName, el);
                    else rowEls.current.delete(row.teamName);
                  }}
                  className={`border-b border-border border-l-4 ${
                    METAL_EDGE[place] ?? 'border-l-transparent'
                  } ${own ? 'bg-primary/15 font-bold' : ''}`}
                  aria-current={own ? 'true' : undefined}
                >
                  <td className={`${cell} font-mono tabular-nums`}>#{row.rank}</td>
                  <td className={cell}>
                    {row.teamName}
                    {own && <span className="ml-2 text-xs uppercase">(you)</span>}
                  </td>
                  <td className={`${num} relative font-bold`}>
                    <AnimatedNumber value={row.total} />
                    {change && change.v === version && (
                      <PointsFloat key={change.v} points={change.points} large={large} />
                    )}
                  </td>
                  <td className={cell}>
                    <span className="font-bold tabular-nums">{solvedCount(row)}</span>
                    <span
                      className={`ml-2 whitespace-nowrap text-muted-foreground ${
                        large ? 'text-lg' : 'text-xs'
                      }`}
                    >
                      E {row.easySolved} · M {row.mediumSolved} · D {row.difficultSolved}
                    </span>
                  </td>
                  <td className={cell}>
                    <RankChangeCell change={change} />
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    <span className={row.mainDone ? 'text-success' : 'text-muted-foreground'}>
                      Main {row.mainDone ? '✓ Done' : '—'}
                    </span>
                    <span
                      className={`ml-3 ${row.coordinatesDone ? 'text-success' : 'text-muted-foreground'}`}
                    >
                      Coordinates {row.coordinatesDone ? '✓ Found' : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && (
        <p className="text-muted-foreground">Your team is not on the public board.</p>
      )}
    </div>
  );
}
