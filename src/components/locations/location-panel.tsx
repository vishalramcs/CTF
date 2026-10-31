'use client';

import { useRouter } from 'next/navigation';

import { AnswerForm } from '@/components/participant/answer-form';
import { formatPoints } from '@/components/leaderboard/format';
import { formatDateTimeIST } from '@/lib/participant/time';

export type LocationView = {
  level: 'easy' | 'medium' | 'difficult' | 'main_difficult';
  name: string;
  rewardPoints: number;
  fragmentsRequired: number;
  fragments: { label: string; value: string; orderClue: string | null; challengeNumber: number }[];
  unlocked: boolean;
  completed: boolean;
  achievedAt: string | null;
  key: { name: string; acquiredAt: string } | null;
};

export const LEVEL_LABEL = {
  easy: 'Easy',
  medium: 'Medium',
  difficult: 'Hard',
  main_difficult: 'Main Mission',
} as const;

// Only fragments this team has earned arrive here; a locked card shows a count and nothing else.
export function LocationPanel({
  location: l,
  onFinalMission,
}: {
  location: LocationView;
  onFinalMission: () => void;
}) {
  const router = useRouter();
  const heading = `${LEVEL_LABEL[l.level]} location`;

  return (
    <article className="panel-notch flex flex-col gap-3 border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-xl font-bold uppercase">{heading}</h3>
        <p className="font-mono text-sm tabular-nums">{formatPoints(l.rewardPoints)} pts</p>
      </header>

      {l.fragments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {l.fragments.map((f) => (
            <li
              key={`${f.challengeNumber}-${f.label}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-ring pl-3"
            >
              <span className="text-sm text-muted-foreground">{f.label}</span>
              <span className="font-mono text-2xl font-semibold">{f.value}</span>
              {f.orderClue && <span className="text-sm">{f.orderClue}</span>}
            </li>
          ))}
        </ul>
      )}

      {l.completed ? (
        <p className="text-success" role="status">
          ✓ Location found{l.achievedAt ? ` ${formatDateTimeIST(l.achievedAt)}` : ''}.{' '}
          {l.key ? `${l.key.name} collected.` : ''}
        </p>
      ) : l.unlocked ? (
        <AnswerForm
          path={`/api/locations/${l.level}/submit`}
          label="Decoded location"
          submitLabel="Decode"
          onCorrect={(o) => {
            if (o.finalMission) onFinalMission();
            router.refresh();
          }}
        />
      ) : (
        <p className="text-muted-foreground">
          🔒 Locked. {l.fragments.length} of {l.fragmentsRequired} fragments held. Solve more
          challenges to recover the rest.
        </p>
      )}
    </article>
  );
}
