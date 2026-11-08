'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { CoordinateBoard } from '@/components/coordinates/coordinate-board';
import HalftoneReveal from '@/components/HalftoneReveal';
import { formatPoints } from '@/components/leaderboard/format';
import { Announcements } from '@/components/participant/announcements';
import { ChallengeCard, DIFFICULTY } from '@/components/participant/challenge-card';
import { LeaderboardPreview } from '@/components/participant/leaderboard-preview';
import { STATUS } from '@/components/participant/phase-banner';
import { useLiveState } from '@/hooks/use-live-state';
import { useRankTracker } from '@/hooks/use-rank-tracker';
import { formatDateTimeIST } from '@/lib/participant/time';
import type { SurpriseDone } from '@/lib/participant/history';
import type { ChallengeCard as Card } from '@/lib/scoring/team-state';
import type { CoordinateBoard as BoardData } from '@/lib/coordinates/state';

const H2 = 'font-heading text-2xl font-bold uppercase';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dash-card dash-card--accent p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-heading text-3xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

// Server data is team-specific and refreshed with router.refresh(); the status and the
// leaderboard preview are the public live state.
export function DashboardClient({
  teamName,
  score,
  rank,
  cards,
  board,
  announcements,
  surprises,
}: {
  teamName: string;
  score: number;
  rank: number | null;
  cards: Card[];
  board: BoardData;
  announcements: { message: string; createdAt: string }[];
  surprises: SurpriseDone[];
}) {
  const router = useRouter();
  const { state } = useLiveState();
  const { changes } = useRankTracker(state);
  // Another tab solved something, or the event changed status: re-read this team's data.
  const seen = useRef<string>(undefined);
  const stamp = state ? `${state.v}:${state.status}` : undefined;
  useEffect(() => {
    if (seen.current && stamp && seen.current !== stamp) router.refresh();
    seen.current = stamp;
  }, [stamp, router]);
  const status = STATUS[state?.status ?? 'running'];

  return (
    <div>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-10 p-4 pb-24">
        <section
          aria-labelledby="welcome"
          className="fade-up flex items-center justify-between gap-6 sm:py-6"
        >
          <div className="flex flex-col gap-2">
            <h1
              id="welcome"
              className="font-heading text-[clamp(1.75rem,9.5vw,2.25rem)] font-black tracking-[0.02em] uppercase sm:text-6xl"
            >
              The city needs you,{' '}
              <span className="whitespace-nowrap text-primary">Spider-Man.</span>
            </h1>
            <p role="status" className="w-fit bg-background/85 px-2 py-1 sm:text-lg">
              <span className="font-heading font-bold text-ring uppercase">
                {state ? status.name : 'Connecting'}
              </span>
              {state && <span className="text-muted-foreground"> · {status.rule}</span>}
            </p>
          </div>
          <div
            aria-hidden
            className="hidden size-56 shrink-0 overflow-hidden rounded-full md:block"
          >
            <HalftoneReveal
              src="/event-logo.png"
              inkColor="#e2232a"
              paperColor="#07090f"
              invert
              cellSize={5}
              style={{}}
            />
          </div>
        </section>

        <section aria-labelledby="score">
          <h2 id="score" className="sr-only">
            Score
          </h2>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total score" value={formatPoints(score)} />
            <Stat label="Rank" value={rank === null ? '—' : `#${rank}`} />
            <Stat
              label="Challenges solved"
              value={`${cards.filter((c) => c.state === 'solved').length}/${cards.length}`}
            />
            <Stat label="Fragments" value={`${board.fragments.length}/${board.slots}`} />
          </dl>
        </section>

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-10">
            <section aria-labelledby="challenges" className="flex flex-col gap-6">
              <h2 id="challenges" className={H2}>
                Challenges
              </h2>
              {/* Easy, medium and difficult mixed in one list, in this team's own shuffled order
                  (listChallengeCards); each card still shows its difficulty. The Main Question
                  keeps its own place at the end. */}
              {[
                cards.filter((c) => c.difficulty !== 'main_difficult'),
                cards.filter((c) => c.difficulty === 'main_difficult'),
              ].map(
                (group, i) =>
                  group.length > 0 && (
                    <div key={i} className="flex flex-col gap-3">
                      {i === 1 && (
                        <h3 className="font-heading text-lg font-bold text-muted-foreground uppercase">
                          {DIFFICULTY.main_difficult.label}
                        </h3>
                      )}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {group.map((card) => (
                          <ChallengeCard key={card.number} card={card} />
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </section>

            <section aria-labelledby="locations" className="flex flex-col gap-3">
              <h2 id="locations" className={H2}>
                Locations
              </h2>
              <CoordinateBoard board={board} />
            </section>

            <section aria-labelledby="surprises" className="flex flex-col gap-2">
              <h2 id="surprises" className={H2}>
                Surprises
              </h2>
              <p className="text-muted-foreground">
                Keep your eyes open. Something may appear in a corner of any page.
              </p>
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-10">
            <LeaderboardPreview
              rows={state?.leaderboard ?? []}
              ownTeam={teamName}
              changes={changes}
            />

            <section aria-labelledby="achievements" className="flex flex-col gap-3">
              <h2 id="achievements" className={H2}>
                Achievements
              </h2>
              {surprises.length === 0 && <p className="text-muted-foreground">None yet.</p>}
              {surprises.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {surprises.map((s) => (
                    <li key={s.kind} className="dash-card p-3">
                      <p className="font-semibold">{s.title}</p>
                      <p className="text-sm text-success">
                        ✓ Completed {formatDateTimeIST(s.at)} · +{formatPoints(s.points)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Announcements initial={announcements} />
          </aside>
        </div>
      </main>
    </div>
  );
}
