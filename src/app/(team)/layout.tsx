import Link from 'next/link';

import { StatusBanner } from '@/components/participant/phase-banner';
import { LogoutButton } from '@/components/shared/logout-button';
import { SessionGuard } from '@/components/shared/session-guard';
import { requireTeam } from '@/lib/auth/guards';
import { getEventState, getTeamScore } from '@/lib/scoring/team-state';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const { teamId, teamName } = await requireTeam();
  const { status } = await getEventState();
  const { score, rank } = await getTeamScore(teamId);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center font-heading text-xl font-black tracking-[0.02em] uppercase"
        >
          {teamName}
        </Link>
        <div className="flex items-center gap-4">
          <p className="font-heading text-2xl font-black tabular-nums">
            {score}
            <span className="sr-only"> points</span>
            {rank !== null && <span className="ml-2 font-mono text-sm">#{rank}</span>}
          </p>
          <LogoutButton loginPath="/login" />
        </div>
      </header>
      <StatusBanner status={status} />
      {children}
      <SessionGuard loginPath="/login" />
    </>
  );
}
