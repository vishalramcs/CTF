'use client';

import { Board } from '@/components/leaderboard/board';
import { ConnectionDot } from '@/components/leaderboard/connection-dot';
import { Feed } from '@/components/leaderboard/feed';
import { Podium } from '@/components/leaderboard/podium';
import { useLiveState } from '@/hooks/use-live-state';

// The board and feed, kept live. `large` is the projector size for /screen.
export function LiveLeaderboard({ ownTeam, large }: { ownTeam?: string; large?: boolean }) {
  const { state, connection } = useLiveState();
  const own = state?.leaderboard.find((r) => r.teamName === ownTeam);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`font-heading font-black uppercase ${large ? 'text-6xl' : 'text-3xl'}`}>
          Leaderboard
        </h1>
        <div className="flex items-center gap-4">
          {state?.frozen && (
            <span className="rounded border border-warn px-2 py-0.5 text-sm text-warn uppercase">
              Frozen
            </span>
          )}
          <ConnectionDot connection={connection} />
        </div>
      </div>
      {/* One polite announcement for the team's own rank; the table itself is not live. */}
      <p className="sr-only" aria-live="polite">
        {own ? `Your team is rank ${own.rank}.` : ''}
      </p>
      {state === null ? (
        <p className="text-muted-foreground" role="status">
          Loading the board…
        </p>
      ) : (
        <>
          <Podium rows={state.leaderboard} ownTeam={ownTeam} large={large} />
          <div className={large ? 'grid gap-8 xl:grid-cols-[2fr_1fr]' : 'flex flex-col gap-6'}>
            <Board rows={state.leaderboard} ownTeam={ownTeam} large={large} />
            <Feed items={state.feed} large={large} />
          </div>
        </>
      )}
    </div>
  );
}
