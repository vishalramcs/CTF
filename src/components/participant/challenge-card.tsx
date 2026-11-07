import Link from 'next/link';
import type { MouseEvent, SyntheticEvent } from 'react';

import FlipCard from '@/components/FlipCard';
import PixelCard from '@/components/PixelCard';
import type { ChallengeCard as Card } from '@/lib/scoring/team-state';
import { playSwing } from '@/lib/swing/controller';

export const DIFFICULTY: Record<
  Card['difficulty'],
  { label: string; border: string; accent: string }
> = {
  easy: { label: 'Easy', border: 'border-difficulty-easy', accent: 'border-l-difficulty-easy' },
  medium: {
    label: 'Medium',
    border: 'border-difficulty-medium',
    accent: 'border-l-difficulty-medium',
  },
  difficult: {
    label: 'Difficult',
    border: 'border-difficulty-difficult',
    accent: 'border-l-difficulty-difficult',
  },
  main_difficult: {
    label: 'Main Question',
    border: 'border-difficulty-main',
    accent: 'border-l-difficulty-main',
  },
};

export function DifficultyChip({ difficulty }: { difficulty: Card['difficulty'] }) {
  const { label, border } = DIFFICULTY[difficulty];
  return <span className={`rounded-sm border px-2 py-0.5 text-xs ${border}`}>{label}</span>;
}

function stateLabel(card: Card): string {
  switch (card.state) {
    case 'solved':
      return `✓ Solved +${card.pointsEarned}`;
    case 'sealed':
      return '🔒 Sealed';
    case 'locked':
      return '🔒 Opens when the event starts';
    case 'closed':
      return 'Closed';
    case 'open':
      return 'Open';
  }
}

// A plain click on "Open mission" plays the swing, then opens the question in a new tab as before.
// Modified clicks (new window, background tab) keep the browser's own behaviour.
function openWithSwing(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.stopPropagation();
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  const swing = playSwing();
  if (!swing) return; // a swing is already playing
  void swing.then(() => {
    // Still within the click's activation window, so the tab is allowed; fall back if blocked.
    const tab = window.open(href, '_blank');
    if (tab) tab.opener = null;
    else window.location.assign(href);
  });
}

// Design Brief §5. Click flips the card; the real link on the back opens the new tab.
export function ChallengeCard({ card }: { card: Card }) {
  // Points fall as more teams solve it, so show what it started at.
  const decayed = card.currentPoints !== card.basePoints;
  // FlipCard captures the pointer and takes Enter and Space, so the link must keep its own events.
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <FlipCard
      flipped={undefined}
      onFlipChange={undefined}
      draggable={false}
      tiltMax={6}
      hoverScale={1.02}
      height={176}
      radius={10}
      background="var(--card)"
      shadowOpacity={0.6}
      ariaLabel={`Question ${card.number}, ${card.title}, ${DIFFICULTY[card.difficulty].label}, ${card.currentPoints} points, ${stateLabel(card)}. Flip for the link.`}
      className={`w-full! focus-visible:ring-2 focus-visible:ring-ring ${
        card.state === 'solved' ? 'opacity-75' : ''
      }`}
      front={
        (
          <PixelCard
            colors={['#e0f2fe', '#38bdf8', '#2d6bff', '#e2232a']}
            gap={8}
            speed={25}
            glowColor="#2d6bff"
            intro={false}
            noFocus
            radius={10}
            style={{
              width: '100%',
              height: '100%',
              placeItems: 'stretch',
              background: 'var(--card)',
            }}
          >
            <div
              className={`flex flex-col justify-between gap-3 rounded-[10px] border border-border border-l-4 p-4 ${DIFFICULTY[card.difficulty].accent}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-heading text-2xl font-black">#{card.number}</p>
                <DifficultyChip difficulty={card.difficulty} />
              </div>
              {/* The card has a fixed height; the back shows the full title. */}
              <p className="line-clamp-2 font-semibold">{card.title}</p>
              <div className="flex items-center justify-between gap-2 text-sm">
                <p className="font-mono whitespace-nowrap tabular-nums">
                  {decayed && (
                    <s className="mr-2 text-muted-foreground">
                      <span className="sr-only">was </span>
                      {card.basePoints}
                    </s>
                  )}
                  {card.currentPoints} pts
                </p>
                <p
                  className={`text-right text-xs sm:text-sm ${
                    card.state === 'solved' ? 'text-success' : 'text-muted-foreground'
                  }`}
                >
                  {stateLabel(card)}
                </p>
              </div>
            </div>
          </PixelCard>
        ) as never
      }
      back={
        (
          <div className="flex h-full flex-col justify-between gap-3 rounded-[10px] border border-border p-4">
            <p className="font-semibold">
              #{card.number} {card.title}
            </p>
            <Link
              href={`/challenge/${card.number}`}
              target="_blank"
              rel="noopener"
              onPointerDown={stop}
              onClick={(event) => openWithSwing(event, `/challenge/${card.number}`)}
              onKeyDown={stop}
              className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-4 font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Open mission
            </Link>
          </div>
        ) as never
      }
    />
  );
}
