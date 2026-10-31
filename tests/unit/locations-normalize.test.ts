import { describe, expect, it } from 'vitest';

import { normalizeLocation } from '@/lib/locations/normalize';

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
