import { describe, expect, it } from 'vitest';

import { normalizeLocation, placeMatches } from '@/lib/coordinates/normalize';

describe('normalizeLocation', () => {
  it.each([
    ['  Coimbatore. ', 'coimbatore'],
    ['COIMBATORE', 'coimbatore'],
    ['São Paulo', 'sao paulo'],
    ['Zürich!', 'zurich'],
    ['New    York,\tUSA', 'new york usa'],
    ['St. Louis', 'st louis'],
    ['Winston-Salem', 'winston salem'],
    ["O'Fallon", 'ofallon'],
    ['O’Fallon', 'ofallon'],
    ['a\0b', 'a b'],
    ['சென்னை', 'சென்னை'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeLocation(input)).toBe(expected);
  });

  it.each(['', '   ', '.,!?', '\0', '\n\t'])('rejects %j', (input) => {
    expect(normalizeLocation(input)).toBeNull();
  });
});

describe('placeMatches', () => {
  it.each([
    ['NEW YORK, USA', 'NEW YORK, USA'],
    ['new york', 'NEW YORK, USA'],
    ['New York City', 'NEW YORK, USA'],
    ['  tokyo ', 'TOKYO, JAPAN'],
    ['London, U.K.', 'LONDON, UK'],
    ['london', 'LONDON, UK'],
  ])('accepts %j for %j', (given, label) => {
    expect(placeMatches(given, label)).toBe(true);
  });

  it.each([
    ['Paris', 'NEW YORK, USA'],
    ['york', 'NEW YORK, USA'],
    ['USA', 'NEW YORK, USA'],
    ['', 'TOKYO, JAPAN'],
    ['Kyoto', 'TOKYO, JAPAN'],
  ])('rejects %j for %j', (given, label) => {
    expect(placeMatches(given, label)).toBe(false);
  });
});
