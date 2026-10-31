import Link from 'next/link';

import { formatPoints } from '@/components/leaderboard/format';
import { StatusBanner } from '@/components/participant/phase-banner';
import { SpiderLogo } from '@/components/participant/spider-logo';
import { TeamNav } from '@/components/participant/team-nav';
import { LogoutButton } from '@/components/shared/logout-button';
import { SessionGuard } from '@/components/shared/session-guard';
import { SurpriseLayer } from '@/components/surprises/surprise-layer';
import { requireTeam } from '@/lib/auth/guards';
import { getEventState, getTeamScore } from '@/lib/scoring/team-state';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const { teamId, teamName } = await requireTeam();
  const { status } = await getEventState();
  const { score, rank } = await getTeamScore(teamId);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border bg-card p-4">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-3 font-heading text-xl font-black tracking-[0.02em] uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <SpiderLogo />
          {teamName}
        </Link>
        <TeamNav />
        <div className="flex items-center gap-4">
          <p className="font-heading text-2xl font-black tabular-nums">
            {formatPoints(score)}
            <span className="sr-only"> points</span>
            {rank !== null && (
              <span className="ml-2 font-mono text-sm">
                #{rank}
                <span className="sr-only"> rank</span>
              </span>
            )}
          </p>
          <LogoutButton loginPath="/login" />
        </div>
      </header>
      <StatusBanner status={status} />
      {children}
      <SurpriseLayer />
      <SessionGuard loginPath="/login" />
    </>
  );
}
