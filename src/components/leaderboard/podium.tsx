'use client';

import { Crown } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';

import { AnimatedNumber, PointsFloat } from '@/components/leaderboard/animated-number';
import { solvedCount } from '@/components/leaderboard/format';
import type { RankChange } from '@/hooks/use-rank-tracker';
import type { BoardRow } from '@/lib/realtime/public-state';

// Design Brief §4: gold, silver, bronze. The rank number and metal name are printed too.
const METAL = [
  {
    name: 'Gold',
    color: 'text-[#f4c542]',
    height: 168,
    block: 'border-[#f4c542] from-[#5a1216] to-[#14161f] shadow-[0_0_32px_rgb(226_35_42/0.45)]',
  },
  {
    name: 'Silver',
    color: 'text-[#c9d1e0]',
    height: 112,
    block: 'border-[#c9d1e0] from-[#26304a] to-[#14161f]',
  },
  {
    name: 'Bronze',
    color: 'text-[#d08a4e]',
    height: 80,
    block: 'border-[#d08a4e] from-[#3a2a20] to-[#14161f]',
  },
];

// Second, first, third, left to right. Keyed by team, so a team changing place moves across.
const SLOTS = [1, 0, 2];

export function Podium({
  rows,
  ownTeam,
  large,
  changes,
  version,
  takeover,
}: {
  rows: BoardRow[];
  ownTeam?: string;
  large?: boolean;
  changes?: ReadonlyMap<string, RankChange>;
  version?: number;
  takeover?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <LayoutGroup>
      <ol
        aria-label="Top three teams"
        className={`mx-auto grid w-full grid-cols-3 items-end gap-2 sm:gap-4 ${
          large ? 'max-w-5xl' : 'max-w-3xl'
        } ${takeover ? 'podium-takeover' : ''}`}
      >
        {SLOTS.map((place) => {
          const row = rows[place];
          if (!row) return <li key={`empty-${place}`} aria-hidden />;
          // By the server's rank, not the slot: teams tied for first are all gold.
          const metal = METAL[row.rank - 1];
          const own = row.teamName === ownTeam;
          const change = changes?.get(row.teamName);
          return (
            <motion.li
              key={row.teamName}
              layout="position"
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              className="flex min-w-0 flex-col items-center gap-1"
            >
              {row.rank === 1 && (
                <Crown aria-hidden className={`text-[#f4c542] ${large ? 'size-10' : 'size-6'}`} />
              )}
              <span
                className={`w-full truncate text-center font-heading font-black uppercase ${
                  large ? 'text-4xl' : 'text-base sm:text-xl'
                } ${own ? 'text-ring' : ''}`}
              >
                {row.teamName}
                {own && <span className="sr-only"> (your team)</span>}
              </span>
              <span
                className={`relative font-bold tabular-nums ${large ? 'text-5xl' : 'text-xl sm:text-2xl'}`}
              >
                <AnimatedNumber value={row.total} />
                <span className="sr-only"> points</span>
                {change && change.v === version && (
                  <PointsFloat key={change.v} points={change.points} large={large} />
                )}
              </span>
              <span className={`text-center ${large ? 'text-xl' : 'text-xs sm:text-sm'}`}>
                {solvedCount(row)} solved
              </span>
              <motion.div
                animate={{ height: large ? metal.height * 1.5 : metal.height }}
                initial={false}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                className={`flex w-full flex-col items-center justify-center rounded-t-lg border-x-2 border-t-2 bg-gradient-to-b ${metal.block}`}
              >
                <span
                  className={`font-heading leading-none font-black ${metal.color} ${
                    large ? 'text-8xl' : 'text-4xl sm:text-5xl'
                  }`}
                >
                  <span className="sr-only">Rank </span>
                  {row.rank}
                </span>
                <span
                  className={`font-mono uppercase ${metal.color} ${large ? 'text-lg' : 'text-xs'}`}
                >
                  {metal.name}
                </span>
              </motion.div>
            </motion.li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}
