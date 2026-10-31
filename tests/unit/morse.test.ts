import { describe, expect, it } from 'vitest';

import { isMorseWord, morseTimeline } from '@/lib/surprises/morse';

describe('morseTimeline', () => {
  it('uses standard timing, with a long pause before it repeats', () => {
    // E = dot, T = dash, with a 3-unit gap between letters.
    expect(morseTimeline('et')).toEqual([400, 1200, 1200, 5000]);
    expect(morseTimeline('s')).toEqual([400, 400, 400, 400, 400, 5000]);
  });

  it('ignores case and extra spaces, and separates words by 7 units', () => {
    expect(morseTimeline('  E   t ')).toEqual([400, 2800, 1200, 5000]);
  });

  it('never blinks faster than the 3 flashes per second the brief allows', () => {
    const timeline = morseTimeline('hello world 123');
    for (let i = 0; i + 1 < timeline.length; i += 2) {
      expect(timeline[i] + timeline[i + 1]).toBeGreaterThanOrEqual(1000 / 3);
    }
  });

  it('gives nothing to blink for text it can not encode', () => {
    expect(morseTimeline('!!!')).toEqual([]);
  });
});

describe('isMorseWord', () => {
  it('accepts letters, digits and spaces up to 30 characters', () => {
    expect(isMorseWord('Web Weaver 7')).toBe(true);
    expect(isMorseWord('web-weaver')).toBe(false);
    expect(isMorseWord('   ')).toBe(false);
    expect(isMorseWord('a'.repeat(31))).toBe(false);
  });
});
