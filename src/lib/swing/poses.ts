// The asset map: one entry per character picture (organiser-supplied, CLAUDE.md rule 11). Each is a
// transparent WebP cut from the organiser's picture (border flood fill, web strands kept).
// `hand` is where the web leaves the picture (the body's centre for a pose with no web), as fractions
// of width and height, measured on the file; `tilt` is how far, in degrees, that web leans from
// straight up (+ = right), so the body can hang along the drawn web line.

export type PoseName = 'swing' | 'hang' | 'webShoot' | 'land' | 'front' | 'login' | 'classic';

export type Pose = {
  src: string;
  w: number;
  h: number;
  hand: readonly [number, number];
  tilt: number;
};

const SWING: Pose = {
  src: '/spidey/poses/swing-classic.webp',
  w: 521,
  h: 479,
  hand: [5.5 / 521, 0],
  tilt: -41,
};
const HANG: Pose = {
  src: '/spidey/poses/hang-grip-web.webp',
  w: 365,
  h: 684,
  hand: [125 / 365, 186 / 684],
  tilt: -14,
};
const LAND: Pose = {
  src: '/spidey/poses/land-crouch.webp',
  w: 588,
  h: 393,
  hand: [0.5, 0.55],
  tilt: 0,
};

export const POSES: Record<PoseName, Pose> = {
  // Organiser image 1: seated, diagonal web. Diagonal swing.
  swing: SWING,
  // Image 2: hanging upright, both hands on the web. Top-to-bottom descent.
  hang: HANG,
  // Image 3: forward, shooting a web. Right-to-left swing.
  webShoot: {
    src: '/spidey/poses/web-shoot-air.webp',
    w: 507,
    h: 394,
    hand: [60 / 507, 24 / 394],
    tilt: -36,
  },
  // Image 4: low crouch. Low swoop and landing.
  land: LAND,
  // Image 5 (front-facing crouch, 1000032384.jpg) was not supplied yet: the low crouch stands in.
  // shortcut: stand-in pose; when the file arrives, cut it like the others and point this at it.
  front: LAND,
  // Image 6: hanging upside down by his feet. Login only, never in any other sequence (a unit test
  // holds this). Cut from the organiser's PNG on light grey; the web leaves at his feet, straight up.
  login: {
    src: '/spidey/poses/hang-upside-down.webp',
    w: 300,
    h: 400,
    hand: [142.5 / 300, 2 / 400],
    tilt: 0,
  },
  // The original left-to-right swing cutout (already transparent).
  classic: { src: '/swing/spiderman.webp', w: 391, h: 367, hand: [0.829, 0.016], tilt: 26.6 },
};
