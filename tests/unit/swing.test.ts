import { describe, expect, it } from 'vitest';

import { isSwingShortcut, isTypingTarget, playSwing, registerSwing } from '@/lib/swing/controller';

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

describe('playSwing', () => {
  it('never overlaps, and plays again once finished', async () => {
    let runs = 0;
    let finish = () => {};
    const off = registerSwing(() => {
      runs++;
      return new Promise<void>((r) => (finish = r));
    });
    const first = playSwing();
    expect(first).not.toBeNull();
    expect(playSwing()).toBeNull();
    finish();
    await first;
    const second = playSwing();
    expect(second).not.toBeNull();
    finish();
    await second;
    expect(runs).toBe(2);
    off();
    // With no overlay registered it resolves at once, so a question still opens.
    await expect(playSwing()).resolves.toBeUndefined();
  });
});
