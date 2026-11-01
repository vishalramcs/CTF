'use client';

import { AnimatePresence, motion } from 'motion/react';

import { formatClockIST, formatPoints } from '@/components/leaderboard/format';
import type { RankEvent } from '@/lib/leaderboard/movement';
import type { FeedItem } from '@/lib/realtime/public-state';

const SHOW = 30;

type Line = {
  key: string;
  at: string;
  text: React.ReactNode;
  points: number | null;
  rank: boolean;
};

const solveLine = (item: FeedItem): Line => ({
  key: `${item.at}-${item.kind}-${item.teamName}-${item.challengeNumber}`,
  at: item.at,
  points: item.points,
  rank: false,
  text: (
    <>
      <strong>{item.teamName}</strong>{' '}
      {item.kind === 'coordinate_winner'
        ? 'found the final coordinates first'
        : item.kind === 'main_first'
          ? `was first to solve the Main Question #${item.challengeNumber}`
          : `solved #${item.challengeNumber} ${item.challengeTitle}`}
    </>
  ),
});

const rankLine = (event: RankEvent): Line => ({
  key: event.id,
  at: event.at,
  points: null,
  rank: true,
  text: (
    <>
      <strong>{event.teamName}</strong> {event.message}{' '}
      <span className="text-muted-foreground">
        #{event.previousRank} → #{event.rank}
      </span>
    </>
  ),
});

export function Feed({
  items,
  events = [],
  large,
}: {
  items: FeedItem[];
  events?: RankEvent[];
  large?: boolean;
}) {
  // Newest first. A rank line sorts just above the solve that caused it, which shares its time.
  const lines = [...events.map(rankLine), ...items.map(solveLine)]
    .sort((a, b) => b.at.localeCompare(a.at) || Number(b.rank) - Number(a.rank))
    .slice(0, SHOW);
  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-2">
      <h2
        id="feed-title"
        className={`font-heading font-bold uppercase ${large ? 'text-3xl' : 'text-xl'}`}
      >
        Live feed
      </h2>
      {lines.length === 0 ? (
        <p className="text-muted-foreground">Nothing to show yet.</p>
      ) : (
        <ul className={`flex flex-col gap-1 ${large ? 'text-xl' : 'text-sm'}`}>
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.li
                key={line.key}
                layout="position"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col gap-0.5 border-b border-border py-1 ${
                  line.rank ? 'border-l-2 border-l-ring pl-2' : ''
                }`}
              >
                <span>{line.text}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatClockIST(line.at)}
                  {line.points !== null && ` · +${formatPoints(line.points)} pts`}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
