'use client';

import { AnimatePresence, motion } from 'motion/react';

import { formatClockIST, formatPoints } from '@/components/leaderboard/format';
import type { RankEvent } from '@/lib/leaderboard/movement';

const MAJOR = new Set(['new_leader', 'top_three', 'climbed']);

// Rank-change notices. Polite and pointer-transparent: they never block the board or a click.
export function RankToasts({ toasts }: { toasts: RankEvent[] }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((event) => (
          <motion.div
            key={event.id}
            layout="position"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-md border-l-4 bg-card p-3 shadow-lg ${
              event.positions < 0 ? 'border-l-primary' : 'border-l-ring'
            } ${MAJOR.has(event.kind) ? 'spider-sense' : ''}`}
          >
            <p className="font-heading text-lg font-black uppercase">
              {event.teamName} {event.message}
            </p>
            <p className="text-sm text-muted-foreground">
              #{event.previousRank} → #{event.rank}
              {event.positions !== 0 && ` (${Math.abs(event.positions)} places)`}
              {event.points !== 0 &&
                ` · ${event.points > 0 ? '+' : ''}${formatPoints(event.points)} pts`}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatClockIST(event.at)}
              {event.challengeNumber !== null &&
                ` · #${event.challengeNumber} ${event.challengeTitle}`}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// The brief full-width moment when first place changes hands.
export function LeaderTakeover({ team }: { team: string | null }) {
  return (
    <AnimatePresence>
      {team && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-x-4 top-24 z-40 mx-auto max-w-2xl rounded-lg border-2 border-[#f4c542] bg-card/95 p-4 text-center shadow-[0_0_48px_rgb(226_35_42/0.5)]"
        >
          <p className="font-mono text-sm tracking-widest text-[#f4c542] uppercase">New leader</p>
          <p className="truncate font-heading text-4xl font-black uppercase sm:text-6xl">{team}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
