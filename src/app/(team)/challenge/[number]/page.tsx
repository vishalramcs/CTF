import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Evidence } from '@/components/challenge/evidence';
import { FlagForm } from '@/components/challenge/flag-form';
import { Hints } from '@/components/challenge/hints';
import { InspectSurfaces } from '@/components/challenge/inspect-surfaces';
import { Workspace } from '@/components/challenge/workspace';
import { DifficultyChip } from '@/components/participant/challenge-card';
import { requireTeam } from '@/lib/auth/guards';
import { env } from '@/lib/env';
import { getChallengeView } from '@/lib/scoring/team-state';
import { getWorkspaceState } from '@/lib/workspace/state';

const BACK = 'inline-flex min-h-11 items-center text-sm text-ring underline underline-offset-4';
const NOT_OPEN = {
  locked: { heading: '🔒 Locked', text: 'This trail opens when the event starts.' },
  closed: { heading: 'Closed', text: 'The event is over.' },
  sealed: { heading: '🔒 Sealed', text: 'Something else has to happen before this trail opens.' },
};

export default async function ChallengePage({ params }: { params: Promise<{ number: string }> }) {
  const { teamId } = await requireTeam();
  const view = await getChallengeView(teamId, (await params).number);
  if (!view) notFound();
  const workspace =
    view.access === 'open' && view.workspace
      ? await getWorkspaceState(teamId, view.workspace)
      : null;

  if (view.access !== 'open') {
    const { heading, text } = NOT_OPEN[view.access];
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-3 bg-background/90 p-4">
        <h1 className="font-heading text-3xl font-black uppercase">{heading}</h1>
        <p>{text}</p>
        <Link href="/dashboard" className={BACK}>
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 bg-background/90 p-4">
      <InspectSurfaces surfaces={view.surfaces} />
      <header className="flex flex-col gap-2">
        <Link href="/dashboard" className={BACK}>
          Back to dashboard
        </Link>
        <h1 className="font-heading text-4xl font-black uppercase">
          #{view.number} {view.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <DifficultyChip difficulty={view.difficulty} />
          <span className="text-muted-foreground">{view.category}</span>
          <span className="font-mono tabular-nums">{view.currentPoints} pts</span>
          {view.solved && <span className="text-success">✓ Solved</span>}
        </div>
      </header>

      {view.story && <p className="whitespace-pre-wrap text-muted-foreground">{view.story}</p>}

      <section aria-labelledby="mission" className="flex flex-col gap-2">
        <h2 id="mission" className="font-heading text-2xl font-bold uppercase">
          Mission
        </h2>
        {/* Already through the allow-list in getChallengeView. */}
        <div dangerouslySetInnerHTML={{ __html: view.html }} />
      </section>

      {workspace && (
        <Workspace number={view.number} initial={workspace} solved={view.solved !== null} />
      )}

      <Evidence blocks={view.evidence} number={view.number} />
      <Hints number={view.number} count={view.hintCount} />
      <FlagForm number={view.number} prefix={env.FLAG_PREFIX} solved={view.solved} />
    </main>
  );
}
