'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, SyntheticEvent } from 'react';

import FlipCard from '@/components/FlipCard';
import PixelCard from '@/components/PixelCard';
import type { ChallengeCard as Card } from '@/lib/scoring/team-state';
import { playQuestionTransition, waitForPath } from '@/lib/swing/controller';

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

// A plain click on "Open mission" plays a Spider-Man transition (a different one each time) between
// the dashboard and the question, in this tab: the question loads under the backdrop once it covers
// the page, and opens out of him. Back returns to the dashboard. Modified clicks (new window,
// background tab) keep the browser's own behaviour. While a transition runs, further clicks are
// ignored. The href is fixed per card, so the question opened is always the one clicked.
function openWithSwing(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  push: (href: string) => void,
) {
  event.stopPropagation();
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  void playQuestionTransition({ onCover: () => push(href), ready: waitForPath(href) });
}

// Design Brief §5. Click flips the card; the real link on the back opens the question.
export function ChallengeCard({ card }: { card: Card }) {
  const router = useRouter();
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
      ariaLabel={`Question: ${card.title}, ${DIFFICULTY[card.difficulty].label}, ${card.currentPoints} points, ${stateLabel(card)}. Flip for the link.`}
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
              {/* No question number: the order is shuffled per team (organiser decision). */}
              <div className="flex items-start justify-end gap-2">
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
            <p className="font-semibold">{card.title}</p>
            <Link
              href={`/challenge/${card.number}`}
              onPointerDown={stop}
              onClick={(event) =>
                openWithSwing(event, `/challenge/${card.number}`, (h) => router.push(h))
              }
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
