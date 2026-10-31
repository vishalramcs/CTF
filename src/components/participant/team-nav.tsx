'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/history', label: 'History' },
];

export function TeamNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? 'page' : undefined}
          className="inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:border-b-2 aria-[current=page]:border-primary"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
