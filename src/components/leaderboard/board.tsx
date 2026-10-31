'use client';

import { useLayoutEffect, useRef } from 'react';

import { formatPoints } from '@/components/leaderboard/format';
import type { BoardRow } from '@/lib/realtime/public-state';

const FLIP_MS = 250;

export function Board({
  rows,
  ownTeam,
  large,
}: {
  rows: BoardRow[];
  ownTeam?: string;
  large?: boolean;
}) {
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const tops = useRef(new Map<string, number>());

  // FLIP: measure after render, play the move from the old position. Skipped for reduced motion.
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    rowEls.current.forEach((el, team) => {
      const top = el.getBoundingClientRect().top;
      next.set(team, top);
      const before = tops.current.get(team);
      if (!reduce && before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: FLIP_MS,
          easing: 'ease-out',
        });
      }
    });
    tops.current = next;
  }, [rows]);

  if (rows.length === 0) return <p className="text-muted-foreground">No teams on the board yet.</p>;

  const cell = large ? 'px-3 py-3' : 'px-2 py-2';
  const num = `${cell} text-right tabular-nums`;
  return (
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
              Total
            </th>
            <th scope="col" className={num}>
              Easy
            </th>
            <th scope="col" className={num}>
              Medium
            </th>
            <th scope="col" className={num}>
              Difficult
            </th>
            <th scope="col" className={num}>
              Main
            </th>
            <th scope="col" className={num}>
              Coordinates
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const own = row.teamName === ownTeam;
            return (
              <tr
                key={row.teamName}
                ref={(el) => {
                  if (el) rowEls.current.set(row.teamName, el);
                  else rowEls.current.delete(row.teamName);
                }}
                className={`border-b border-border ${own ? 'bg-primary/15 font-bold' : ''}`}
                aria-current={own ? 'true' : undefined}
              >
                <td className={`${cell} font-mono tabular-nums`}>#{row.rank}</td>
                <td className={cell}>
                  {row.teamName}
                  {own && <span className="ml-2 text-xs uppercase">(you)</span>}
                </td>
                <td className={`${num} font-bold`}>{formatPoints(row.total)}</td>
                <td className={num}>{row.easySolved}</td>
                <td className={num}>{row.mediumSolved}</td>
                <td className={num}>{row.difficultSolved}</td>
                <td className={num}>{row.mainDone ? '✓ Done' : '—'}</td>
                <td className={num}>{row.coordinatesDone ? '✓ Found' : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
