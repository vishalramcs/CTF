// Pure motion for the Spider-Man engine: one step of a sequence, at progress p in [0, 1], gives where
// the web hand is and how the body sits. Positions are fractions of the viewport (negative or above
// 1 = off screen); the renderer turns them into pixels.

import type { PoseName } from './poses';

export type Vec = readonly [number, number];

export type Step = {
  pose: PoseName;
  ms: number;
  /** swing: a pendulum round `anchor`. drop: falls on a web and bounces on its tension. leap: no web. */
  motion: 'swing' | 'drop' | 'leap';
  /** The hand (web attachment) at the start and the end. The last step's `to` is the exit. */
  from: Vec;
  to: Vec;
  /** Where the web is fixed. drop defaults to straight above `from`, at the top edge. */
  anchor?: Vec;
  /** The web shoots out to the anchor at the start. */
  shoot?: boolean;
  /** Size as a multiple of the base size: start, peak (mid-step, nearest the camera), end. */
  scale: readonly [number, number, number];
  /** Extra rotation in degrees, reached by the end of the step (leap: the whole turn). */
  rot?: number;
  /** leap: how high the arc rises, as a fraction of the viewport height. */
  lift?: number;
  /** Mirror the pose (swings the other way round). */
  flip?: boolean;
  /** Backdrop opacity, start and end. */
  curtain?: Vec;
  /** The backdrop reaches its end value at this progress (default 1). Navigation starts there. */
  curtainBy?: number;
  /** Open the backdrop as an iris from the character instead of fading it. */
  iris?: boolean;
  /** A landing: a shock ring and a small squash at the start of the step. */
  impact?: boolean;
  /** Character opacity, start and end. */
  fade?: Vec;
  /** Wait here until the next page is ready (a navigating sequence). */
  hold?: boolean;
};

export type Frame = {
  x: number;
  y: number;
  rot: number;
  /** The body hangs along the web, so the pose's own web tilt is taken off. */
  alongWeb: boolean;
  scale: number;
  /** 0..1, for motion blur. */
  speed: number;
  opacity: number;
  curtain: number;
  /** 0..1 iris opening (only with step.iris). */
  iris: number;
  /** 0..1 landing impact, fading out (only with step.impact). */
  impact: number;
  web: { ax: number; ay: number; reach: number } | null;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const deg = (rad: number) => (rad * 180) / Math.PI;

export function frameAt(step: Step, progress: number, W: number, H: number): Frame {
  const p = clamp01(progress);
  const F = [step.from[0] * W, step.from[1] * H] as const;
  const T = [step.to[0] * W, step.to[1] * H] as const;
  const [s0, s1, s2] = step.scale;
  const common = {
    // Grows toward the camera mid-step: the peak sits on top of the straight start-to-end blend.
    scale: lerp(s0, s2, p) + (s1 - (s0 + s2) / 2) * Math.sin(Math.PI * p),
    opacity: step.fade ? lerp(step.fade[0], step.fade[1], smooth(p)) : 1,
    curtain: step.curtain
      ? lerp(step.curtain[0], step.curtain[1], smooth(clamp01(p / (step.curtainBy ?? 1))))
      : 0,
    iris: step.iris ? smooth(p) : 0,
    impact: step.impact ? clamp01(1 - p / 0.45) : 0,
  };
  const reach = step.shoot ? easeOut(clamp01(p / 0.15)) : 1;

  if (step.motion === 'swing') {
    const A = [(step.anchor ?? [0.5, -1])[0] * W, (step.anchor ?? [0.5, -1])[1] * H] as const;
    const th0 = Math.atan2(F[0] - A[0], F[1] - A[1]);
    const th1 = Math.atan2(T[0] - A[0], T[1] - A[1]);
    // Pendulum timing: slow at the ends of the arc, fastest at the bottom.
    const s = (1 - Math.cos(Math.PI * p)) / 2;
    const th = lerp(th0, th1, s);
    const r = lerp(Math.hypot(F[0] - A[0], F[1] - A[1]), Math.hypot(T[0] - A[0], T[1] - A[1]), s);
    const speed = Math.sin(Math.PI * p);
    return {
      ...common,
      x: A[0] + r * Math.sin(th),
      y: A[1] + r * Math.cos(th),
      // Along the web, the body trailing a little behind the swing.
      rot: -deg(th) - 9 * speed * Math.sign(th1 - th0) + (step.rot ?? 0) * s,
      alongWeb: true,
      speed,
      web: { ax: A[0], ay: A[1], reach },
    };
  }

  if (step.motion === 'drop') {
    const A = step.anchor ? [step.anchor[0] * W, step.anchor[1] * H] : [F[0], -0.05 * H];
    const d = T[1] - F[1];
    const OVER = 0.08;
    // Gravity first, then the web catches him and he bounces to rest.
    const y =
      p < 0.55
        ? F[1] + d * (1 + OVER) * Math.pow(p / 0.55, 2)
        : T[1] +
          OVER *
            d *
            Math.exp(-5 * ((p - 0.55) / 0.45)) *
            Math.cos(3 * Math.PI * ((p - 0.55) / 0.45));
    const x = lerp(F[0], T[0], smooth(p));
    const wobble = 5 * Math.sin(3 * Math.PI * p) * (1 - p);
    return {
      ...common,
      x,
      y,
      rot: -deg(Math.atan2(x - A[0], y - A[1])) + wobble + (step.rot ?? 0) * smooth(p),
      alongWeb: true,
      speed: p < 0.55 ? p / 0.55 : clamp01(1 - (p - 0.55) / 0.25),
      web: { ax: A[0], ay: A[1], reach },
    };
  }

  // leap
  const e = smooth(p);
  return {
    ...common,
    x: lerp(F[0], T[0], e),
    y: lerp(F[1], T[1], e) - (step.lift ?? 0) * H * Math.sin(Math.PI * p),
    rot: (step.rot ?? 0) * e,
    alongWeb: false,
    speed: Math.sin(Math.PI * p),
    web: null,
  };
}
