'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { formatPoints } from '@/components/leaderboard/format';
import { FinalMissionOverlay } from '@/components/locations/final-mission';
import {
  LEVEL_LABEL,
  LocationPanel,
  type LocationView,
} from '@/components/locations/location-panel';
import { Announcements } from '@/components/participant/announcements';
import { ChallengeCard, DIFFICULTY } from '@/components/participant/challenge-card';
import { KeyBadge } from '@/components/participant/key-badge';
import { LeaderboardPreview } from '@/components/participant/leaderboard-preview';
import { STATUS } from '@/components/participant/phase-banner';
import { useLiveState } from '@/hooks/use-live-state';
import { formatDateTimeIST } from '@/lib/participant/time';
import type { SurpriseDone } from '@/lib/participant/history';
import type { ChallengeCard as Card } from '@/lib/scoring/team-state';

const GROUPS: Card['difficulty'][] = ['easy', 'medium', 'difficult', 'main_difficult'];
const H2 = 'font-heading text-2xl font-bold uppercase';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-notch border border-border bg-card p-4">
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
  locations,
  announcements,
  surprises,
}: {
  teamName: string;
  score: number;
  rank: number | null;
  cards: Card[];
  locations: LocationView[];
  announcements: { message: string; createdAt: string }[];
  surprises: SurpriseDone[];
}) {
  const router = useRouter();
  const { state } = useLiveState();
  // Another tab solved something, or the event changed status: re-read this team's data.
  const seen = useRef<string>(undefined);
  const stamp = state ? `${state.v}:${state.status}` : undefined;
  useEffect(() => {
    if (seen.current && stamp && seen.current !== stamp) router.refresh();
    seen.current = stamp;
  }, [stamp, router]);
  const [finale, setFinale] = useState(false);
  const status = STATUS[state?.status ?? 'running'];
  const keys = locations.filter((l) => l.key).length;

  return (
    <div className="web-bg">
      <main className="mx-auto flex max-w-[1200px] flex-col gap-10 p-4 pb-24">
        <section aria-labelledby="welcome" className="fade-up flex flex-col gap-2 py-6">
          <h1
            id="welcome"
            className="font-heading text-4xl font-black tracking-[0.02em] uppercase sm:text-6xl"
          >
            The city needs you, <span className="text-primary">Spider-Man.</span>
          </h1>
          <p role="status" className="text-lg">
            <span className="font-heading font-bold text-ring uppercase">
              {state ? status.name : 'Connecting'}
            </span>
            {state && <span className="text-muted-foreground"> · {status.rule}</span>}
          </p>
        </section>

        <section aria-labelledby="score">
          <h2 id="score" className="sr-only">
            Score
          </h2>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total score" value={formatPoints(score)} />
            <Stat label="Rank" value={rank === null ? '—' : `#${rank}`} />
            <Stat
              label="Challenges solved"
              value={`${cards.filter((c) => c.state === 'solved').length}/${cards.length}`}
            />
            <Stat
              label="Locations found"
              value={`${locations.filter((l) => l.completed).length}/4`}
            />
            <Stat label="Cosmic Keys" value={`${keys}/4`} />
          </dl>
        </section>

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-10">
            <section aria-labelledby="challenges" className="flex flex-col gap-6">
              <h2 id="challenges" className={H2}>
                Challenges
              </h2>
              {GROUPS.map((difficulty) => {
                const group = cards.filter((c) => c.difficulty === difficulty);
                if (group.length === 0) return null;
                return (
                  <div key={difficulty} className="flex flex-col gap-3">
                    <h3 className="font-heading text-lg font-bold text-muted-foreground uppercase">
                      {DIFFICULTY[difficulty].label}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.map((card) => (
                        <ChallengeCard key={card.number} card={card} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            <section aria-labelledby="locations" className="flex flex-col gap-3">
              <h2 id="locations" className={H2}>
                Location discovery
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {locations.map((l) => (
                  <LocationPanel
                    key={l.level}
                    location={l}
                    onFinalMission={() => setFinale(true)}
                  />
                ))}
              </div>
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
            <LeaderboardPreview rows={state?.leaderboard ?? []} ownTeam={teamName} />

            <section aria-labelledby="achievements" className="flex flex-col gap-3">
              <h2 id="achievements" className={H2}>
                Achievements
              </h2>
              <ul className="flex flex-col gap-2">
                {locations.map((l) => (
                  <KeyBadge
                    key={l.level}
                    level={l.level}
                    name={l.key?.name ?? `${LEVEL_LABEL[l.level]} Cosmic Key`}
                    acquiredAt={l.key?.acquiredAt ?? null}
                  />
                ))}
              </ul>
              {surprises.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {surprises.map((s) => (
                    <li key={s.kind} className="border border-border bg-card p-3">
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
      {finale && <FinalMissionOverlay onClose={() => setFinale(false)} />}
    </div>
  );
}
