'use client';

import { usePathname, useRouter } from 'next/navigation';

import GooeyNav from '@/components/GooeyNav';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/history', label: 'History' },
];

export function TeamNav() {
  const path = usePathname();
  const router = useRouter();
  return (
    // GooeyNav renders plain anchors: keep them as links, but navigate without a full reload.
    // Own full-width row on a phone, below the team name and score.
    <div
      className="order-last w-full sm:order-none sm:w-auto"
      onClickCapture={(event) => {
        const href = (event.target as Element).closest('a')?.getAttribute('href');
        if (!href || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.push(href);
      }}
    >
      <GooeyNav
        items={LINKS}
        activeIndex={LINKS.findIndex(({ href }) => href === path)}
        onChange={undefined}
        color="#8f2a30"
        activeTextColor="#f1e6e7"
        colors={['#2d6bff', '#38bdf8', '#8f2a30'] as never[]}
        style={{ '--gn-y': '14px', '--gn-frame': 'rgba(14, 19, 32, 0.8)', textShadow: 'none' }}
      />
    </div>
  );
}
