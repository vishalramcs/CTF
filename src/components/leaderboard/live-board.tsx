'use client';

import { MotionConfig } from 'motion/react';

import { Board } from '@/components/leaderboard/board';
import { ConnectionDot } from '@/components/leaderboard/connection-dot';
import { Feed } from '@/components/leaderboard/feed';
import { Podium } from '@/components/leaderboard/podium';
import { LeaderTakeover, RankToasts } from '@/components/leaderboard/rank-toasts';
import { StatusBar } from '@/components/leaderboard/status-bar';
import { WebSlinger } from '@/components/leaderboard/web-slinger';
import { useLiveState } from '@/hooks/use-live-state';
import { useRankTracker } from '@/hooks/use-rank-tracker';

// The board and feed, kept live. `large` is the projector size for /screen.
export function LiveLeaderboard({ ownTeam, large }: { ownTeam?: string; large?: boolean }) {
  const { state, connection } = useLiveState();
  const { changes, events, toasts, newLeader } = useRankTracker(state);
  const own = state?.leaderboard.find((r) => r.teamName === ownTeam);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-widest uppercase">Mission control</p>
            <h1 className={`font-heading font-black uppercase ${large ? 'text-6xl' : 'text-3xl'}`}>
              Leaderboard
            </h1>
          </div>
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
            {connection === 'offline'
              ? 'Could not load the board. Retrying…'
              : 'Loading the board…'}
          </p>
        ) : (
          <>
            <StatusBar state={state} large={large} />
            <div className="grid items-end gap-4 lg:grid-cols-[1fr_minmax(0,3fr)_1fr]">
              <WebSlinger pose="swing" className="hidden max-h-80 w-full lg:block" />
              <div className="min-w-0">
                <WebSlinger pose="swing" className="mx-auto mb-2 h-24 lg:hidden" />
                <Podium
                  rows={state.leaderboard}
                  ownTeam={ownTeam}
                  large={large}
                  changes={changes}
                  version={state.v}
                  takeover={newLeader !== null}
                />
              </div>
              <WebSlinger pose="crouch" className="hidden max-h-80 w-full lg:block" />
            </div>
            <div className="web-divider" aria-hidden />
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <div className="mission-panel min-w-0 rounded-lg p-4">
                <Board
                  rows={state.leaderboard}
                  ownTeam={ownTeam}
                  large={large}
                  changes={changes}
                  version={state.v}
                />
              </div>
              <div className="mission-panel min-w-0 self-start rounded-lg p-4">
                <Feed items={state.feed} events={events} large={large} />
              </div>
            </div>
            <RankToasts toasts={toasts} />
            <LeaderTakeover team={newLeader} />
          </>
        )}
      </div>
    </MotionConfig>
  );
}
