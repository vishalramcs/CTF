'use client';

import { useEffect, useRef } from 'react';

import { isSwingShortcut, isTypingTarget, playSwing, registerSwing } from '@/lib/swing/controller';

const SRC = '/swing/spiderman.webp';
const ASPECT = 391 / 367; // width / height of the cutout
// The glove that holds the web, as a fraction of the image (the rope attaches here).
const HAND_X = 0.829;
const HAND_Y = 0.016;
// In the picture the web leaves the hand this far right of vertical.
const ROPE_TILT_DEG = 26.6;
const DURATION_MS = 2500;
const SHOOT = 0.12; // share of the run the web takes to reach its anchor
const MAX_AMPLITUDE = (56 * Math.PI) / 180;
const GHOST_LAG = [0.022, 0.045];

const ease = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Pose = { x: number; y: number; rot: number; scale: number; speed: number };

// One frame of the pendulum: progress p in [0, 1] -> where the hand is and how the body sits.
function pose(p: number, W: number, H: number, charH: number): Pose & { ax: number; ay: number } {
  const charW = charH * ASPECT;
  // A long, flat arc keeps him on screen; the swing is just wide enough to start and end off-screen.
  const L = Math.max(1.35 * W, 1.2 * H);
  const amplitude = Math.min(MAX_AMPLITUDE, Math.asin(Math.min(0.95, (0.5 * W + charW * 1.15) / L)));
  const lowest = 0.28 * H; // hand height at the bottom of the arc
  const ax = 0.5 * W;
  const ay = lowest - L;
  // Pendulum released from rest at -A: fastest at the bottom, slowing as it climbs out.
  const theta = -amplitude * Math.cos(Math.PI * p);
  const omega = Math.sin(Math.PI * p); // 0..1, relative angular speed
  const x = ax + L * Math.sin(theta);
  const y = ay + L * Math.cos(theta);
  // Closest to the camera at the bottom of the arc.
  const depth = Math.pow(Math.cos((theta / amplitude) * (Math.PI / 2)), 1.4);
  const scale = 0.55 + 0.8 * depth;
  // Body hangs along the rope, trailing a little behind the swing.
  const rot = (-theta * 180) / Math.PI - ROPE_TILT_DEG - 9 * omega;
  return { x, y, rot, scale, speed: omega, ax, ay };
}

export function SwingOverlay() {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLImageElement>(null);
  const ghosts = useRef<(HTMLImageElement | null)[]>([]);
  const rope = useRef<SVGLineElement>(null);
  const shade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preload = new Image();
    preload.src = SRC;

    const run = () =>
      new Promise<void>((resolve) => {
        const el = root.current;
        const img = hero.current;
        const line = rope.current;
        if (!el || !img || !line) return resolve();
        el.dataset.active = 'true';
        const start = performance.now();

        const place = (node: HTMLImageElement, p: number, W: number, H: number, charH: number) => {
          const q = pose(clamp01(p), W, H, charH);
          const w = charH * ASPECT;
          node.style.height = `${charH}px`;
          node.style.width = `${w}px`;
          node.style.transform = `translate3d(${q.x - HAND_X * w}px, ${q.y - HAND_Y * charH}px, 0) rotate(${q.rot}deg) scale(${q.scale})`;
          return q;
        };

        const frame = (now: number) => {
          const p = clamp01((now - start) / DURATION_MS);
          const W = window.innerWidth;
          const H = window.innerHeight;
          const charH = Math.min(0.42 * Math.min(W, H) + 40, 440);

          const q = place(img, p, W, H, charH);
          img.style.filter = `blur(${(q.speed * 1.4).toFixed(2)}px) drop-shadow(0 18px 24px rgb(0 0 0 / 0.55))`;
          ghosts.current.forEach((g, i) => {
            if (!g) return;
            place(g, p - GHOST_LAG[i], W, H, charH);
            g.style.opacity = (q.speed * (i === 0 ? 0.3 : 0.14)).toFixed(3);
          });

          // The web shoots from the hand to the anchor, then stays taut and follows the swing.
          const reach = ease(clamp01(p / SHOOT));
          line.setAttribute('x1', String(q.x));
          line.setAttribute('y1', String(q.y));
          line.setAttribute('x2', String(q.x + (q.ax - q.x) * reach));
          line.setAttribute('y2', String(q.y + (q.ay - q.y) * reach));

          if (shade.current) shade.current.style.opacity = (0.4 * Math.sin(Math.PI * p)).toFixed(3);

          if (p < 1) requestAnimationFrame(frame);
          else {
            delete el.dataset.active;
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });

    const unregister = registerSwing(run);

    const onKey = (e: KeyboardEvent) => {
      if (!isSwingShortcut(e) || isTypingTarget(e.target)) return;
      e.preventDefault();
      void playSwing();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unregister();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={root} aria-hidden className="swing-overlay">
      <div ref={shade} className="swing-shade" />
      <svg className="swing-rope" width="100%" height="100%">
        <line ref={rope} x1="0" y1="0" x2="0" y2="0" />
      </svg>
      {GHOST_LAG.map((_, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- transformed every frame; next/image adds nothing here
        <img
          key={i}
          ref={(n) => {
            ghosts.current[i] = n;
          }}
          src={SRC}
          alt=""
          className="swing-hero swing-ghost"
          draggable={false}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img ref={hero} src={SRC} alt="" className="swing-hero" draggable={false} />
    </div>
  );
}
