'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {
  isTypingTarget,
  markPoseFailed,
  notifyPath,
  playSwing,
  registerSwing,
  secretFor,
} from '@/lib/swing/controller';
import { frameAt, type Frame, type Step } from '@/lib/swing/motion';
import { POSES, type PoseName } from '@/lib/swing/poses';
import { baseSize, sequenceForPath, SEQUENCES } from '@/lib/swing/sequences';

const GHOST_LAG = [0.025, 0.05];
// Never drawn bigger than this multiple of the picture's own height: no blurry blow-ups.
const MAX_UPSCALE = 1.9;

// Shorter on a modest device (organiser rule: never slow the CTF down).
const pace = () =>
  typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4 ? 0.8 : 1;

// The one renderer for every Spider-Man animation (mounted once, in the root layout). Sequences are
// data (src/lib/swing/sequences.ts); this draws a frame of the current step with requestAnimationFrame:
// the body, two motion-blur ghosts, the SVG web line, a landing ring and the backdrop, which either
// fades or opens as an iris from the character. Nothing here re-renders React.
export function SwingOverlay() {
  const root = useRef<HTMLDivElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const web = useRef<SVGPathElement>(null);
  const ring = useRef<SVGEllipseElement>(null);
  const hero = useRef<HTMLImageElement>(null);
  const ghosts = useRef<(HTMLImageElement | null)[]>([]);
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // Load and decode every pose up front, so no transition waits on a download.
    for (const name of Object.keys(POSES) as PoseName[]) {
      const img = new Image();
      img.src = POSES[name].src;
      img.decode().catch(() => markPoseFailed(name));
    }

    const place = (node: HTMLImageElement, step: Step, f: Frame, W: number, H: number) => {
      const pose = POSES[step.pose];
      const h = baseSize(W, H);
      const w = (h * pose.w) / pose.h;
      const flip = step.flip ? -1 : 1;
      const rot = f.rot - (f.alongWeb ? pose.tilt * flip : 0);
      const scale = Math.min(f.scale, (MAX_UPSCALE * pose.h) / h);
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      // The origin is the hand, so rotating and scaling keep the hand on the web.
      node.style.transform = `translate3d(${f.x - pose.hand[0] * w}px, ${f.y - pose.hand[1] * h}px, 0) rotate(${rot}deg) scale(${scale * flip}, ${scale})`;
    };

    const render = (step: Step, p: number, sway = 0) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const f = frameAt(step, p, W, H);
      f.rot += sway;
      if (hero.current) {
        place(hero.current, step, f, W, H);
        hero.current.style.opacity = f.opacity.toFixed(3);
        hero.current.style.filter = `blur(${(f.speed * 0.9).toFixed(2)}px) drop-shadow(0 18px 24px rgb(0 0 0 / 0.55))`;
      }
      ghosts.current.forEach((g, i) => {
        if (!g) return;
        place(g, step, frameAt(step, p - GHOST_LAG[i], W, H), W, H);
        g.style.opacity = (f.speed * (i === 0 ? 0.26 : 0.12) * f.opacity).toFixed(3);
      });

      const c = curtain.current;
      if (c) {
        c.style.opacity = f.curtain.toFixed(3);
        if (step.iris) {
          // The page opens out of the character (the middle of the screen if he has left).
          const visible = f.opacity > 0.05 && f.x > 0 && f.x < W && f.y > 0 && f.y < H;
          const cx = visible ? f.x : W / 2;
          const cy = visible ? f.y : H / 2;
          const r = f.iris * Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.1;
          const mask = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, #000 ${r + 80}px)`;
          c.style.maskImage = mask;
          c.style.setProperty('-webkit-mask-image', mask);
        } else if (c.style.maskImage) {
          c.style.maskImage = '';
          c.style.removeProperty('-webkit-mask-image');
        }
      }

      const line = web.current;
      if (line) {
        if (!f.web) line.setAttribute('d', '');
        else {
          const ex = f.x + (f.web.ax - f.x) * f.web.reach;
          const ey = f.y + (f.web.ay - f.y) * f.web.reach;
          // A little slack, swept back by the speed.
          const cx = (f.x + ex) / 2 - 14 * f.speed;
          const cy = (f.y + ey) / 2 + 6 * f.speed;
          line.setAttribute('d', `M${f.x},${f.y} Q${cx},${cy} ${ex},${ey}`);
        }
      }

      const o = ring.current;
      if (o) {
        // Landing: a ring spreads out from under him and fades.
        const k = 1 - f.impact;
        o.setAttribute('cx', String(f.x));
        o.setAttribute('cy', String(f.y + 0.25 * baseSize(W, H)));
        o.setAttribute('rx', String(40 + 260 * k));
        o.setAttribute('ry', String(8 + 44 * k));
        o.style.opacity = (f.impact * 0.7).toFixed(3);
      }
    };

    const frames = (signal: AbortSignal, tick: (now: number) => boolean) =>
      new Promise<void>((resolve) => {
        const loop = (now: number) => {
          if (signal.aborted || !tick(now)) return resolve();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

    const setPose = async (step: Step) => {
      const pose = POSES[step.pose];
      for (const node of [hero.current, ...ghosts.current]) {
        if (!node) continue;
        if (node.dataset.src !== pose.src) {
          node.src = pose.src;
          node.dataset.src = pose.src;
        }
        node.style.transformOrigin = `${pose.hand[0] * 100}% ${pose.hand[1] * 100}%`;
      }
      try {
        await hero.current?.decode();
      } catch (e) {
        markPoseFailed(step.pose);
        throw e; // the controller still navigates
      }
    };

    const unregister = registerSwing(async (name, opts, signal) => {
      const el = root.current;
      if (!el) return;
      const seq = SEQUENCES[name](window.innerWidth, window.innerHeight, opts.origin);
      const speed = pace();
      try {
        for (let i = 0; i < seq.steps.length; i++) {
          const step = seq.steps[i];
          await setPose(step);
          if (signal.aborted) return;
          if (i === 0) {
            el.dataset.backdrop = seq.backdrop;
            el.dataset.active = 'true';
            // A navigating sequence takes the clicks until the next page is showing.
            if (seq.cover !== undefined) el.dataset.block = 'true';
          }
          if (step.hold && opts.ready) {
            // Hang on, gently swaying, until the next page is ready under the backdrop.
            let ready = false;
            opts.ready.then(
              () => (ready = true),
              () => (ready = true),
            );
            const t0 = performance.now();
            await frames(signal, (now) => {
              if (ready) return false;
              render(step, 0, 2.5 * Math.sin((now - t0) / 320));
              return true;
            });
          }
          if (step.hold) delete el.dataset.block;
          const ms = step.ms * speed;
          const coverAt = i === seq.cover ? (seq.coverAt ?? 1) : 2;
          const t0 = performance.now();
          await frames(signal, (now) => {
            const p = Math.min(1, (now - t0) / ms);
            render(step, p);
            if (p >= coverAt) opts.onCover?.();
            return p < 1;
          });
          if (signal.aborted) return;
          if (i === seq.cover) opts.onCover?.();
        }
      } finally {
        // An entrance cut short by a transition leaves the stage to it.
        if (!signal.aborted) {
          delete el.dataset.active;
          delete el.dataset.block;
          if (curtain.current) {
            curtain.current.style.opacity = '0';
            curtain.current.style.maskImage = '';
            curtain.current.style.removeProperty('-webkit-mask-image');
          }
          if (ring.current) ring.current.style.opacity = '0';
        }
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return;
      const name = secretFor(e);
      if (!name) return;
      e.preventDefault();
      void playSwing(name);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unregister();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // In-app navigation to a page with an entrance plays it; the first load does not.
  useEffect(() => {
    notifyPath(pathname);
    const prev = lastPath.current;
    lastPath.current = pathname;
    if (prev === null || prev === pathname) return;
    const seq = sequenceForPath(pathname);
    if (seq) void playSwing(seq);
  }, [pathname]);

  return (
    <div ref={root} aria-hidden className="swing-overlay">
      <div ref={curtain} className="swing-curtain" />
      <svg className="swing-rope" width="100%" height="100%">
        <ellipse ref={ring} className="swing-ring" cx="0" cy="0" rx="0" ry="0" />
        <path ref={web} d="" />
      </svg>
      {GHOST_LAG.map((_, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- transformed every frame; next/image adds nothing here
        <img
          key={i}
          ref={(n) => {
            ghosts.current[i] = n;
          }}
          alt=""
          className="swing-hero swing-ghost"
          draggable={false}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img ref={hero} alt="" className="swing-hero" draggable={false} />
    </div>
  );
}
