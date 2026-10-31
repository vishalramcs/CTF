'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/teams', label: 'Teams' },
  { href: '/admin/challenges', label: 'Challenges' },
  { href: '/admin/coordinates', label: 'Coordinates' },
  { href: '/admin/solves', label: 'Solves' },
  { href: '/admin/surprises', label: 'Surprises' },
  { href: '/admin/event', label: 'Event' },
  { href: '/admin/monitor', label: 'Monitor' },
  { href: '/admin/announcements', label: 'Announcements' },
  { href: '/admin/scores', label: 'Scores' },
  { href: '/admin/audit', label: 'Audit' },
];

export function AdminNav({ isSuper }: { isSuper: boolean }) {
  const pathname = usePathname();
  const links = isSuper ? [...LINKS, { href: '/admin/developers', label: 'Developers' }] : LINKS;

  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1">
      {links.map(({ href, label }) => {
        const current = href === '/admin' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={`inline-flex h-11 items-center rounded-md px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:h-9 ${
              current ? 'bg-muted underline underline-offset-4' : 'text-muted-foreground'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
