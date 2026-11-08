// Every Spider-Man animation on the site, as data for the one engine (src/components/swing). Each is
// built for the current viewport, so a phone and a projector both get an arc that starts and ends
// off screen. Durations follow the organiser's rule: question transitions 0.8-1.5 s (the approach,
// 1.5-2 s), login about 1.5-2 s, plus however long the next page takes to arrive.

import type { Step, Vec } from './motion';
import { POSES } from './poses';

export type Origin = { x: number; y: number; h: number }; // px: the hand, and the character height

export type Sequence = {
  steps: Step[];
  backdrop: 'solid' | 'vignette';
  /** A page entrance: never blocks, and gives way to a real transition. */
  ambient?: boolean;
  /** The step, and its progress, at which the backdrop covers the page: navigation starts there. */
  cover?: number;
  coverAt?: number;
};

/** The six moves. Each is a question transition (`q:`) and a secret show (`s:`). */
export const MOVES = [
  'swingRight',
  'swingLeft',
  'descent',
  'approach',
  'diagonal',
  'swoop',
] as const;
export type Move = (typeof MOVES)[number];

type Entrance = 'dashboard' | 'leaderboard' | 'history' | 'tools';
export type SequenceName = 'login' | 'easter' | Entrance | `q:${Move}` | `s:${Move}`;

/** The character's height at scale 1. */
export const baseSize = (W: number, H: number) => Math.min(0.42 * Math.min(W, H) + 40, 440);

const flat = (s: number) => [s, s, s] as const;

/**
 * A pendulum across the whole viewport: at the bottom of the arc the body's centre is at `body`
 * (fraction of height), so a pose whose web leaves far from the body still shows him; the arc is
 * just wide enough to start and end with the body off screen. dir 1 = left to right. `stretch`
 * lengthens the web during the swing, so the arc runs downhill: a diagonal.
 */
function cross(
  W: number,
  H: number,
  dir: 1 | -1,
  body: number,
  step: Omit<Step, 'motion' | 'from' | 'to' | 'anchor'>,
  { ax = 0.5, stretch = 0 }: { ax?: number; stretch?: number } = {},
): Step {
  const { w, h, hand } = POSES[step.pose];
  const size = baseSize(W, H) * step.scale[1];
  const span = baseSize(W, H) * Math.max(...step.scale) * Math.max(w / h, 1);
  // Hanging along the web, the picture's centre sits this far below the hand.
  const below = (Math.hypot((0.5 - hand[0]) * w, (0.5 - hand[1]) * h) / h) * size;
  const L = Math.max(1.35 * W, 1.2 * H);
  const reach = 0.5 * W + Math.abs(ax - 0.5) * W + 1.15 * span;
  const a = Math.min((62 * Math.PI) / 180, Math.asin(Math.min(0.95, reach / (L * (1 - stretch)))));
  const ay = body * H - below - L;
  const end = (side: number, r: number) =>
    [(ax * W + side * r * Math.sin(a)) / W, (ay + r * Math.cos(a)) / H] as const;
  return {
    ...step,
    motion: 'swing',
    anchor: [ax, ay / H],
    from: end(-dir, L * (1 - stretch)),
    to: end(dir, L * (1 + stretch)),
  };
}

// A step that only opens the backdrop (the character has already left).
const vanish = (ms: number): Step => ({
  pose: 'classic',
  ms,
  motion: 'leap',
  from: [0.5, 0.5],
  to: [0.5, 0.5],
  scale: flat(1),
  fade: [0, 0],
});

type Built = { steps: Step[]; cover: number; coverAt: number };

const MOVE: Record<Move, (W: number, H: number) => Built> = {
  // A: the original left-to-right swing.
  swingRight: (W, H) => ({
    cover: 0,
    coverAt: 0.5,
    steps: [
      cross(W, H, 1, 0.5, { pose: 'classic', ms: 1000, shoot: true, scale: [0.55, 1.35, 0.55] }),
      vanish(380),
    ],
  }),
  // B: right to left, shooting a web.
  swingLeft: (W, H) => ({
    cover: 0,
    coverAt: 0.5,
    steps: [
      cross(W, H, -1, 0.5, {
        pose: 'webShoot',
        ms: 1000,
        flip: true,
        shoot: true,
        scale: [0.5, 1.3, 0.5],
      }),
      vanish(380),
    ],
  }),
  // C: drops from the top on his web, then is pulled back up through the opening.
  descent: () => ({
    cover: 0,
    coverAt: 0.55,
    steps: [
      {
        pose: 'hang',
        ms: 800,
        motion: 'drop',
        from: [0.5, -0.55],
        to: [0.5, 0.22],
        scale: [0.8, 1, 1.15],
      },
      {
        pose: 'hang',
        ms: 450,
        motion: 'drop',
        from: [0.5, 0.22],
        to: [0.5, -1],
        anchor: [0.5, -0.05],
        scale: flat(1.15),
      },
    ],
  }),
  // D: from far away straight at the camera; the page opens out of him as he passes.
  approach: () => ({
    cover: 0,
    coverAt: 0.6,
    steps: [
      {
        pose: 'front',
        ms: 1100,
        motion: 'leap',
        from: [0.62, 0.42],
        to: [0.5, 0.55],
        lift: 0.04,
        rot: -4,
        scale: [0.12, 0.55, 1.25],
      },
      {
        pose: 'front',
        ms: 550,
        motion: 'leap',
        from: [0.5, 0.55],
        to: [0.5, 0.58],
        scale: [1.25, 1.5, 1.75],
        fade: [1, 0],
      },
    ],
  }),
  // E: a long downhill pendulum, top right to bottom left, nearest the camera mid-arc.
  diagonal: (W, H) => ({
    cover: 0,
    coverAt: 0.5,
    steps: [
      cross(
        W,
        H,
        -1,
        0.5,
        { pose: 'swing', ms: 1100, shoot: true, scale: [0.45, 1.25, 0.9] },
        { ax: 0.55, stretch: 0.12 },
      ),
      vanish(380),
    ],
  }),
  // F: swoops down from the top right, lands with an impact, springs away.
  swoop: () => ({
    cover: 0,
    coverAt: 0.85,
    steps: [
      {
        pose: 'land',
        ms: 650,
        motion: 'leap',
        from: [1.2, -0.15],
        to: [0.42, 0.66],
        lift: -0.08,
        scale: [0.5, 0.9, 1],
      },
      {
        pose: 'land',
        ms: 220,
        motion: 'leap',
        from: [0.42, 0.66],
        to: [0.42, 0.66],
        scale: [0.94, 1, 1],
        impact: true,
      },
      {
        pose: 'land',
        ms: 600,
        motion: 'leap',
        from: [0.42, 0.66],
        to: [1.3, 0.25],
        lift: 0.2,
        rot: 12,
        scale: [1, 1.05, 0.7],
      },
    ],
  }),
};

// Dashboard -> question: the move covers the page (navigation starts there), the last step waits for
// the question and opens onto it as an iris from the character.
function transition({ steps, cover, coverAt }: Built): Sequence {
  const last = steps.length - 1;
  return {
    backdrop: 'solid',
    cover,
    coverAt,
    steps: steps.map((s, i) => {
      if (i < cover) return s;
      if (i === cover) return { ...s, curtain: [0, 1] as Vec, curtainBy: coverAt };
      if (i < last) return { ...s, curtain: [1, 1] as Vec };
      return { ...s, hold: true, curtain: [1, 1] as Vec, iris: true };
    }),
  };
}

// The same move as a secret show: nothing navigates, the page only dims a little.
function show({ steps }: Built): Sequence {
  const last = steps.length - 1;
  return {
    backdrop: 'vignette',
    steps: steps.map((s, i) => ({
      ...s,
      curtain: (i === 0 ? [0, 0.5] : i === last ? [0.5, 0] : [0.5, 0.5]) as Vec,
    })),
  };
}

function byMove<P extends 'q' | 's'>(prefix: P, wrap: (b: Built) => Sequence) {
  return Object.fromEntries(
    MOVES.map((m) => [`${prefix}:${m}`, (W: number, H: number) => wrap(MOVE[m](W, H))]),
  ) as Record<`${P}:${Move}`, (W: number, H: number) => Sequence>;
}

export const SEQUENCES: Record<SequenceName, (W: number, H: number, o?: Origin) => Sequence> = {
  ...byMove('q', transition),
  ...byMove('s', show),

  // Login success, always the same: he drops from where he hangs, nears the camera, and swings out
  // of the way as the dashboard opens behind him. The only sequence that may use the login pose.
  login: (W, H, o) => {
    const ox = o ? o.x / W : 0.8;
    const s = o ? o.h / baseSize(W, H) : 1;
    return {
      backdrop: 'solid',
      cover: 0,
      coverAt: 0.65,
      steps: [
        {
          pose: 'login',
          ms: 1000,
          motion: 'drop',
          from: [ox, o ? o.y / H : -0.2],
          to: [ox, 0.28],
          anchor: [ox, -0.02],
          scale: [s, s * 1.35, s * 1.8],
          curtain: [0, 1],
          curtainBy: 0.65,
        },
        {
          pose: 'login',
          ms: 650,
          motion: 'swing',
          hold: true,
          from: [ox, 0.28],
          to: [ox >= 0.5 ? 1.5 : -0.5, 0.05],
          anchor: [ox, -0.5],
          scale: [s * 1.8, s * 1.9, s * 1.4],
          curtain: [1, 1],
          iris: true,
        },
      ],
    };
  },

  // Ctrl+Alt+Shift+L: the full show, nothing navigates.
  easter: (W, H) => ({
    backdrop: 'vignette',
    steps: [
      cross(W, H, 1, 0.55, {
        pose: 'webShoot',
        ms: 1300,
        shoot: true,
        scale: [0.6, 1.5, 0.7],
        curtain: [0, 0.75],
      }),
      cross(W, H, -1, 0.5, {
        pose: 'swing',
        ms: 1200,
        flip: true,
        shoot: true,
        scale: [0.6, 1.2, 0.6],
        curtain: [0.75, 0.75],
      }),
      {
        pose: 'land',
        ms: 600,
        motion: 'leap',
        from: [-0.15, 0.05],
        to: [0.5, 0.62],
        lift: 0.15,
        scale: [0.8, 1, 1.15],
        curtain: [0.75, 0.75],
      },
      {
        pose: 'land',
        ms: 500,
        motion: 'leap',
        from: [0.5, 0.62],
        to: [0.5, 0.85],
        scale: [1.15, 1.5, 1.8],
        fade: [1, 0],
        curtain: [0.75, 0],
      },
    ],
  }),

  // Page entrances: short, small, over the page, never in the way of a click.
  dashboard: () => ({
    backdrop: 'vignette',
    ambient: true,
    steps: [
      {
        pose: 'land',
        ms: 650,
        motion: 'leap',
        from: [1.15, -0.15],
        to: [0.86, 0.8],
        lift: 0.1,
        scale: flat(0.45),
      },
      {
        pose: 'land',
        ms: 550,
        motion: 'leap',
        from: [0.86, 0.8],
        to: [1.25, 0.45],
        lift: 0.15,
        rot: 20,
        scale: flat(0.45),
        fade: [1, 0.6],
      },
    ],
  }),
  leaderboard: (W, H) => ({
    backdrop: 'vignette',
    ambient: true,
    steps: [
      cross(W, H, -1, 0.4, {
        pose: 'webShoot',
        ms: 1300,
        flip: true,
        shoot: true,
        scale: [0.4, 0.7, 0.4],
      }),
    ],
  }),
  history: () => ({
    backdrop: 'vignette',
    ambient: true,
    steps: [
      {
        pose: 'hang',
        ms: 850,
        motion: 'drop',
        from: [0.88, -0.5],
        to: [0.88, 0.12],
        scale: flat(0.5),
      },
      {
        pose: 'hang',
        ms: 600,
        motion: 'drop',
        from: [0.88, 0.12],
        to: [0.88, -0.75],
        anchor: [0.88, -0.05],
        scale: flat(0.5),
      },
    ],
  }),
  tools: (W, H) => ({
    backdrop: 'vignette',
    ambient: true,
    steps: [
      cross(W, H, 1, 0.4, { pose: 'classic', ms: 1300, shoot: true, scale: [0.4, 0.7, 0.4] }),
    ],
  }),
};

const PAGE: Record<string, SequenceName> = {
  '/dashboard': 'dashboard',
  '/leaderboard': 'leaderboard',
  '/history': 'history',
  '/tools': 'tools',
};

/** The entrance for a page reached by in-app navigation, if it has one. */
export const sequenceForPath = (path: string): SequenceName | null => PAGE[path] ?? null;

/** Every pose a sequence uses (so a picture that failed to load can rule its sequences out). */
export const posesOf = (name: SequenceName) =>
  new Set(SEQUENCES[name](1280, 720, { x: 1000, y: 100, h: 300 }).steps.map((s) => s.pose));
