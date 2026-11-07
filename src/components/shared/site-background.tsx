'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import GradientASCII from '@/components/GradientASCII';

const FIELD = {
  shape: 'fill',
  colors: ['#050b2e', '#0b1b5e', '#0b1b5e', '#1e3fd8', '#2d6bff', '#38bdf8', '#e2232a'],
};
const TUNNEL = {
  shape: 'portal',
  colors: ['#000000', '#2a0a5e', '#7b1fa2', '#e0218a', '#ff6a00', '#ffb300', '#ff6a00'],
};
const TUNNEL_PATHS = ['/history'];
const BOARD_PATHS = ['/leaderboard', '/screen'];
const ADMIN_SHAPES = ['fill', 'portal', 'horizon', 'pinch', 'rise', 'eclipse'];

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export function SiteBackground() {
  const path = usePathname();
  const isAdmin = path.startsWith('/admin') && path !== '/admin/login';
  const [adminLook, setAdminLook] = useState(FIELD);

  // Picked in an effect so server and client render the same first frame.
  useEffect(() => {
    if (isAdmin) {
      setAdminLook({ shape: pick(ADMIN_SHAPES), colors: pick([FIELD.colors, TUNNEL.colors]) });
    }
  }, [path, isAdmin]);

  // Organiser-supplied web over the skyline, behind the leaderboard and the projector screen.
  if (BOARD_PATHS.includes(path)) {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[#1b2a55]">
        <img
          src="/swing/board-bg.webp"
          alt=""
          className="h-full w-full object-cover object-[50%_45%]"
        />
        {/* Keeps the board readable over the bright web. */}
        <div className="absolute inset-0 bg-black/40" />
      </div>
    );
  }

  const look = isAdmin ? adminLook : TUNNEL_PATHS.includes(path) ? TUNNEL : FIELD;
  return (
    <div aria-hidden className="glitch-bg pointer-events-none fixed inset-0 -z-10">
      <GradientASCII
        {...look}
        intro={false}
        density={0.9}
        glyphOpacity={0.8}
        glow={0.35}
        gradientOpacity={0.65}
        grain={0.04}
        speed={0.5}
        dpr={1}
        style={{}}
      />
    </div>
  );
}
