import Link from 'next/link';

import type { ChallengeCard as Card } from '@/lib/scoring/team-state';

export const DIFFICULTY: Record<Card['difficulty'], { label: string; border: string }> = {
  easy: { label: 'Easy', border: 'border-difficulty-easy' },
  medium: { label: 'Medium', border: 'border-difficulty-medium' },
  difficult: { label: 'Difficult', border: 'border-difficulty-difficult' },
  main_difficult: { label: 'Main Question', border: 'border-difficulty-main' },
};

export function DifficultyChip({ difficulty }: { difficulty: Card['difficulty'] }) {
  const { label, border } = DIFFICULTY[difficulty];
  return <span className={`rounded-sm border px-2 py-0.5 text-xs ${border}`}>{label}</span>;
}

function stateLabel(card: Card): string {
  switch (card.state) {
    case 'solved':
      return `✓ Solved +${card.pointsEarned}`;
    case 'locked':
      return '🔒 Opens when the event starts';
    case 'closed':
      return 'Closed';
    case 'open':
      return 'Open';
  }
}

// Design Brief §5. A real link is keyboard reachable and opens the new tab without any script.
export function ChallengeCard({ card }: { card: Card }) {
  // Points fall as more teams solve it, so show what it started at.
  const decayed = card.currentPoints !== card.basePoints;
  return (
    <Link
      href={`/challenge/${card.number}`}
      target="_blank"
      rel="noopener"
      className={`flex min-h-32 flex-col justify-between gap-3 border border-border bg-card p-4 [clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,0_100%)] hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset ${
        card.state === 'solved' ? 'opacity-75' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-heading text-2xl font-black">#{card.number}</p>
        <DifficultyChip difficulty={card.difficulty} />
      </div>
      <p className="font-semibold">{card.title}</p>
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="font-mono tabular-nums">
          {decayed && (
            <s className="mr-2 text-muted-foreground">
              <span className="sr-only">was </span>
              {card.basePoints}
            </s>
          )}
          {card.currentPoints} pts
        </p>
        <p className={card.state === 'solved' ? 'text-success' : 'text-muted-foreground'}>
          {stateLabel(card)}
        </p>
      </div>
    </Link>
  );
}
