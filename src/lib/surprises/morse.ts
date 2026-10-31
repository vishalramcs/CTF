// The Spidey Signal word as blink timings. Pure, so it can be tested without a database.
const UNIT_MS = 400; // a dot and its gap last 800 ms: well under the brief's 3 flashes per second.
const REPEAT_GAP_MS = 5000;

const CODE: Record<string, string> = {
  a: '.-',
  b: '-...',
  c: '-.-.',
  d: '-..',
  e: '.',
  f: '..-.',
  g: '--.',
  h: '....',
  i: '..',
  j: '.---',
  k: '-.-',
  l: '.-..',
  m: '--',
  n: '-.',
  o: '---',
  p: '.--.',
  q: '--.-',
  r: '.-.',
  s: '...',
  t: '-',
  u: '..-',
  v: '...-',
  w: '.--',
  x: '-..-',
  y: '-.--',
  z: '--..',
  0: '-----',
  1: '.----',
  2: '..---',
  3: '...--',
  4: '....-',
  5: '.....',
  6: '-....',
  7: '--...',
  8: '---..',
  9: '----.',
};

export function isMorseWord(word: string): boolean {
  const trimmed = word.trim();
  return trimmed.length <= 30 && /^[a-z0-9 ]+$/i.test(trimmed);
}

// [on, off, on, off, ...] in ms, ending with the pause before it repeats. Only ever these numbers
// reach a browser, never the word itself.
export function morseTimeline(word: string): number[] {
  const timeline: number[] = [];
  const words = word.trim().toLowerCase().split(/\s+/);
  words.forEach((w, wordIndex) => {
    const letters = [...w].filter((ch) => CODE[ch]);
    letters.forEach((ch, letterIndex) => {
      [...CODE[ch]].forEach((symbol) => {
        timeline.push((symbol === '-' ? 3 : 1) * UNIT_MS, UNIT_MS);
      });
      if (letterIndex < letters.length - 1) timeline[timeline.length - 1] = 3 * UNIT_MS;
    });
    if (timeline.length && wordIndex < words.length - 1)
      timeline[timeline.length - 1] = 7 * UNIT_MS;
  });
  if (timeline.length) timeline[timeline.length - 1] = REPEAT_GAP_MS;
  return timeline;
}
