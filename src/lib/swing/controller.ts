// The one Spider-Man engine's switchboard. Question clicks, the login form, page changes and the
// Ctrl+Alt+Shift+L shortcut all call playSwing(); the overlay in the root layout registers the only
// runner. Only one animation plays at a time.

import type { PoseName } from './poses';
import { createShuffleBag } from './shuffle';
import { MOVES, posesOf, SEQUENCES, type Move, type Origin, type SequenceName } from './sequences';

export type PlayOptions = {
  /** Login: where the hanging character is now. */
  origin?: Origin;
  /** Called exactly once: when the backdrop covers the page, or at once if nothing plays. */
  onCover?: () => void;
  /** A `hold` step waits for this (the next page being ready). */
  ready?: Promise<unknown>;
};

type Runner = (name: SequenceName, opts: PlayOptions, signal: AbortSignal) => Promise<void>;

let runner: Runner | null = null;
let running: { ambient: boolean; abort: AbortController } | null = null;

export function registerSwing(run: Runner): () => void {
  runner = run;
  return () => {
    if (runner === run) runner = null;
  };
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Plays a sequence. Resolves when it has finished (at once with reduced motion or before the overlay
 * mounts). Returns null when it is not played: a transition is already running, or this is a page
 * entrance and anything is running. A transition cuts a page entrance short.
 */
export function playSwing(
  name: SequenceName = 'easter',
  opts: PlayOptions = {},
): Promise<void> | null {
  const ambient = SEQUENCES[name](1, 1).ambient ?? false;
  if (running) {
    if (ambient || !running.ambient) return null;
    running.abort.abort();
    running = null;
  }
  let covered = false;
  const cover = () => {
    if (covered) return;
    covered = true;
    opts.onCover?.();
  };
  if (!runner || reducedMotion()) {
    cover();
    return Promise.resolve();
  }
  const abort = new AbortController();
  running = { ambient, abort };
  return runner(name, { ...opts, onCover: cover }, abort.signal)
    .catch(() => {})
    .finally(() => {
      cover(); // an animation error must never strand a navigation
      if (running?.abort === abort) running = null;
    });
}

// The current path, so a navigating sequence can wait for the next page before revealing it.
let path = '';
const waiters = new Set<() => void>();

export function notifyPath(next: string): void {
  path = next;
  waiters.forEach((w) => w());
}

/** Resolves once the app shows `target` (a pathname), or after `ms` whatever happened. */
export function waitForPath(target: string, ms = 15000): Promise<void> {
  return new Promise((resolve) => {
    if (path === target) return resolve();
    const done = () => {
      clearTimeout(timer);
      waiters.delete(check);
      resolve();
    };
    const check = () => {
      if (path === target) done();
    };
    const timer = setTimeout(done, ms);
    waiters.add(check);
  });
}

// Pictures that failed to load: sequences using them are never picked.
const failed = new Set<PoseName>();
export function markPoseFailed(pose: PoseName): void {
  failed.add(pose);
}

function eligibleMoves(prefix: 'q' | 's'): Move[] {
  return MOVES.filter((m) => [...posesOf(`${prefix}:${m}`)].every((p) => !failed.has(p)));
}

const questionBag = createShuffleBag<Move>();
const secretBag = createShuffleBag<Move>();

/** The question transition: a different move each time (src/lib/swing/shuffle.ts). */
export function playQuestionTransition(opts: PlayOptions): Promise<void> | null {
  if (running && !running.ambient) return null; // a second click: ignored, and the bag keeps its turn
  const move = questionBag.next(eligibleMoves('q'));
  if (!move) {
    opts.onCover?.();
    return Promise.resolve();
  }
  return playSwing(`q:${move}`, opts);
}

type KeyLike = Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key' | 'code'>;

// Hidden shortcuts, never shown anywhere: Alt+Shift+S a random show, D the descent, Z the approach
// (R, the right-to-left swing, was removed with that move). Plus Ctrl+Alt+Shift+L, the full easter egg. `code` is the physical key, so layouts
// where Alt changes the produced character still work.
const SECRET: Record<string, Move | 'random'> = {
  KeyS: 'random',
  KeyD: 'descent',
  KeyZ: 'approach',
};

export function secretFor(e: KeyLike): SequenceName | null {
  if (isSwingShortcut(e)) return 'easter';
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
  const move = SECRET[e.code];
  if (!move) return null;
  if (move !== 'random') return `s:${move}`;
  const pick = secretBag.next(eligibleMoves('s'));
  return pick ? `s:${pick}` : null;
}

export function isSwingShortcut(e: KeyLike): boolean {
  // `code` covers layouts where Ctrl+Alt changes the produced character.
  return (
    e.ctrlKey &&
    e.altKey &&
    e.shiftKey &&
    !e.metaKey &&
    (e.code === 'KeyL' || e.key.toLowerCase() === 'l')
  );
}

type TargetLike = { tagName?: string; isContentEditable?: boolean } | null;

export function isTypingTarget(target: EventTarget | TargetLike): boolean {
  const t = target as TargetLike;
  if (!t) return false;
  if (t.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes((t.tagName ?? '').toUpperCase());
}
