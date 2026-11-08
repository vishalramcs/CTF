import { describe, expect, it } from 'vitest';

import {
  isSwingShortcut,
  isTypingTarget,
  notifyPath,
  playQuestionTransition,
  playSwing,
  registerSwing,
  secretFor,
  waitForPath,
} from '@/lib/swing/controller';
import { frameAt } from '@/lib/swing/motion';
import {
  baseSize,
  MOVES,
  posesOf,
  sequenceForPath,
  SEQUENCES,
  type SequenceName,
} from '@/lib/swing/sequences';
import { createShuffleBag } from '@/lib/swing/shuffle';

const key = (over: Partial<KeyboardEvent>) =>
  ({
    ctrlKey: true,
    altKey: true,
    shiftKey: true,
    metaKey: false,
    key: 'L',
    code: 'KeyL',
    ...over,
  }) as KeyboardEvent;

const W = 1280;
const H = 720;
const ALL = Object.keys(SEQUENCES) as SequenceName[];

describe('swing shortcut', () => {
  it('needs Ctrl, Alt, Shift and L together, either case', () => {
    expect(isSwingShortcut(key({}))).toBe(true);
    expect(isSwingShortcut(key({ key: 'l' }))).toBe(true);
    // Some layouts turn Ctrl+Alt+L into another character; the physical key still counts.
    expect(isSwingShortcut(key({ key: '£' }))).toBe(true);
    expect(isSwingShortcut(key({ ctrlKey: false }))).toBe(false);
    expect(isSwingShortcut(key({ altKey: false }))).toBe(false);
    expect(isSwingShortcut(key({ shiftKey: false }))).toBe(false);
    expect(isSwingShortcut(key({ metaKey: true }))).toBe(false);
    expect(isSwingShortcut(key({ key: 'K', code: 'KeyK' }))).toBe(false);
  });

  it('ignores typing targets', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('secret shortcuts', () => {
  const alt = (code: string, over: Partial<KeyboardEvent> = {}) =>
    key({ ctrlKey: false, key: code.slice(3).toLowerCase(), code, ...over });
  it('maps Alt+Shift+R, D, Z to their moves and S to a random show', () => {
    expect(secretFor(alt('KeyR'))).toBe('s:swingLeft');
    expect(secretFor(alt('KeyD'))).toBe('s:descent');
    expect(secretFor(alt('KeyZ'))).toBe('s:approach');
    expect(secretFor(alt('KeyS'))).toMatch(/^s:/);
    expect(secretFor(key({}))).toBe('easter');
  });
  it('ignores other keys and combinations', () => {
    expect(secretFor(alt('KeyQ'))).toBeNull();
    expect(secretFor(alt('KeyR', { shiftKey: false }))).toBeNull();
    expect(secretFor(alt('KeyR', { ctrlKey: true }))).toBeNull(); // AltGr on Windows is Ctrl+Alt
    expect(secretFor(alt('KeyR', { metaKey: true }))).toBeNull();
  });
});

describe('playSwing', () => {
  it('never overlaps, and plays again once finished', async () => {
    let runs = 0;
    let finish = () => {};
    const off = registerSwing(() => {
      runs++;
      return new Promise<void>((r) => (finish = r));
    });
    const first = playQuestionTransition({});
    expect(first).not.toBeNull();
    expect(playQuestionTransition({})).toBeNull(); // a rapid second click is ignored
    expect(playSwing('dashboard')).toBeNull(); // a page entrance never interrupts
    expect(playSwing('s:descent')).toBeNull(); // nor does a secret show
    finish();
    await first;
    const second = playSwing('easter');
    expect(second).not.toBeNull();
    finish();
    await second;
    expect(runs).toBe(2);
    off();
  });

  it('lets a transition cut a page entrance short', async () => {
    const signals: AbortSignal[] = [];
    const ends: (() => void)[] = [];
    const off = registerSwing((_name, _opts, signal) => {
      signals.push(signal);
      return new Promise<void>((r) => ends.push(r));
    });
    const entrance = playSwing('leaderboard');
    expect(entrance).not.toBeNull();
    const question = playQuestionTransition({});
    expect(question).not.toBeNull();
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    ends.forEach((e) => e());
    await Promise.all([entrance, question]);
    off();
  });

  it('always navigates exactly once: no overlay, a finished run, or a failed one', async () => {
    let covers = 0;
    const onCover = () => covers++;
    await playQuestionTransition({ onCover }); // no overlay registered: at once
    expect(covers).toBe(1);

    const off = registerSwing(async (_n, opts) => {
      opts.onCover?.();
      opts.onCover?.();
    });
    await playQuestionTransition({ onCover });
    expect(covers).toBe(2);
    off();

    const off2 = registerSwing(async () => {
      throw new Error('decode failed');
    });
    await playQuestionTransition({ onCover });
    expect(covers).toBe(3);
    off2();
  });

  it('picks a different question transition each time', async () => {
    const names: string[] = [];
    const off = registerSwing(async (name) => {
      names.push(name);
    });
    for (let i = 0; i < 30; i++) await playQuestionTransition({});
    off();
    expect(names.every((n) => n.startsWith('q:'))).toBe(true);
    for (let i = 1; i < names.length; i++) {
      expect(names[i]).not.toBe(names[i - 1]);
      if (i > 1) expect(names[i]).not.toBe(names[i - 2]);
    }
    expect(new Set(names).size).toBe(MOVES.length);
  });
});

describe('shuffle bag', () => {
  it('never repeats within the last two, and is fair over time', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const bag = createShuffleBag<string>(random);
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const picks = Array.from({ length: 600 }, () => bag.next(items)!);
    for (let i = 2; i < picks.length; i++) {
      expect(picks[i]).not.toBe(picks[i - 1]);
      expect(picks[i]).not.toBe(picks[i - 2]);
    }
    const counts = items.map((x) => picks.filter((p) => p === x).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(6);
  });

  it('skips ineligible items, copes with tiny pools', () => {
    const bag = createShuffleBag<string>();
    const picks = Array.from({ length: 20 }, () =>
      bag.next(['a', 'b', 'c'].filter((x) => x !== 'b'))!,
    );
    expect(picks.includes('b')).toBe(false);
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
    expect(bag.next(['a'])).toBe('a');
    expect(bag.next(['a'])).toBe('a');
    expect(bag.next([])).toBeNull();
  });
});

describe('waitForPath', () => {
  it('resolves when the app reaches the page, or on time-out', async () => {
    notifyPath('/dashboard');
    const ready = waitForPath('/challenge/3');
    let done = false;
    void ready.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    notifyPath('/challenge/3');
    await ready;
    await expect(waitForPath('/nowhere', 5)).resolves.toBeUndefined();
  });
});

describe('sequences', () => {
  const origin = { x: 960, y: 90, h: 400 };

  it('keeps the login pose for login only', () => {
    for (const name of ALL) expect(posesOf(name).has('login')).toBe(name === 'login');
  });

  it('keeps every transition within the organiser timing', () => {
    const total = (name: SequenceName) =>
      SEQUENCES[name](W, H, origin).steps.reduce((t, s) => t + s.ms, 0);
    for (const m of MOVES) {
      const ms = total(`q:${m}`);
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(m === 'approach' ? 2000 : 1500);
    }
    expect(total('login')).toBeGreaterThanOrEqual(1500);
    expect(total('login')).toBeLessThanOrEqual(2000);
  });

  it('navigating sequences cover the page before navigating, hold, then open', () => {
    for (const name of [...MOVES.map((m) => `q:${m}` as const), 'login' as const]) {
      const seq = SEQUENCES[name](W, H, origin);
      const step = seq.steps[seq.cover!];
      expect(frameAt(step, seq.coverAt!, W, H).curtain).toBeCloseTo(1, 5);
      const last = seq.steps.at(-1)!;
      expect(last.hold && last.iris).toBe(true);
      expect(frameAt(last, 1, W, H).iris).toBe(1);
    }
  });

  it('secret shows never navigate', () => {
    for (const m of MOVES) {
      const seq = SEQUENCES[`s:${m}`](W, H);
      expect(seq.cover).toBeUndefined();
      expect(seq.steps.some((s) => s.hold || s.iris)).toBe(false);
    }
  });

  it('a swing starts and ends off screen and is fastest mid-arc', () => {
    for (const name of ['q:swingRight', 'q:swingLeft', 'q:diagonal'] as const) {
      const [step] = SEQUENCES[name](W, H).steps;
      const a = frameAt(step, 0, W, H);
      const b = frameAt(step, 1, W, H);
      expect(a.x).toBeCloseTo(step.from[0] * W, 3);
      expect(b.y).toBeCloseTo(step.to[1] * H, 3);
      expect(Math.min(a.x, b.x)).toBeLessThan(0);
      expect(Math.max(a.x, b.x)).toBeGreaterThan(W);
      expect(frameAt(step, 0.5, W, H).speed).toBeCloseTo(1, 5);
    }
  });

  it('the diagonal runs downhill', () => {
    const [step] = SEQUENCES['q:diagonal'](W, H).steps;
    expect(frameAt(step, 1, W, H).y).toBeGreaterThan(frameAt(step, 0, W, H).y + 0.15 * H);
  });

  it('a drop overshoots on the web and settles where it should', () => {
    const [drop] = SEQUENCES.login(W, H, origin).steps;
    const ys = Array.from({ length: 101 }, (_, i) => frameAt(drop, i / 100, W, H).y);
    expect(ys[0]).toBeCloseTo(90, 3);
    expect(Math.max(...ys)).toBeGreaterThan(drop.to[1] * H);
    expect(ys[100]).toBeCloseTo(drop.to[1] * H, 0);
  });

  it('the login drop starts from the hanging hero, at its size', () => {
    const [drop] = SEQUENCES.login(W, H, origin).steps;
    expect(frameAt(drop, 0, W, H).scale * baseSize(W, H)).toBeCloseTo(400, 3);
  });

  it('the swoop lands with an impact', () => {
    const steps = SEQUENCES['q:swoop'](W, H).steps;
    const landing = steps.findIndex((s) => s.impact);
    expect(landing).toBeGreaterThan(0);
    expect(frameAt(steps[landing], 0, W, H).impact).toBe(1);
    expect(frameAt(steps[landing], 1, W, H).impact).toBe(0);
  });

  it('maps each page to its own entrance', () => {
    expect(sequenceForPath('/dashboard')).toBe('dashboard');
    expect(sequenceForPath('/leaderboard')).toBe('leaderboard');
    expect(sequenceForPath('/history')).toBe('history');
    expect(sequenceForPath('/tools')).toBe('tools');
    expect(sequenceForPath('/challenge/3')).toBeNull();
    for (const name of ['dashboard', 'leaderboard', 'history', 'tools'] as const)
      expect(SEQUENCES[name](W, H).ambient).toBe(true);
  });
});
