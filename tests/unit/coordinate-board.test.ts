import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CoordinateBoard } from '@/components/coordinates/coordinate-board';
import { fragmentId } from '@/lib/coordinates/fragments';
import type { CoordinateBoard as BoardData } from '@/lib/coordinates/state';


const slot = (order: number, value: string | null) => ({
  id: fragmentId(order),
  held: value !== null,
  value,
  from: value === null ? null : order,
});

// `values` is the fragment held in each slot 1-6, or null.
function board(values: (string | null)[]): BoardData {
  const locations = [1, 2, 3].map((position) => {
    const north = slot(2 * position - 1, values[2 * position - 2]);
    const south = slot(2 * position, values[2 * position - 1]);
    const reconstructed = north.held && south.held;
    return {
      position,
      north,
      south,
      reconstructed,
      label: reconstructed ? `PLACE${position}` : null,
      text: reconstructed ? `TEXT${position}` : null,
    };
  });
  return {
    slots: 6,
    fragments: [],
    locations,
    finalCoordinates: null,
    found: false,
  };
}

const render = (values: (string | null)[]) =>
  renderToStaticMarkup(createElement(CoordinateBoard, { board: board(values) }));

describe('fragmentId', () => {
  it('names the six slots L1-N to L3-S', () => {
    expect([1, 2, 3, 4, 5, 6].map(fragmentId)).toEqual([
      'L1-N',
      'L1-S',
      'L2-N',
      'L2-S',
      'L3-N',
      'L3-S',
    ]);
  });
});

describe('CoordinateBoard', () => {
  it('shows three locked locations before any fragment is held', () => {
    const html = render([null, null, null, null, null, null]);
    expect(html.match(/Incomplete/g)).toHaveLength(3);
    expect(html.match(/🔒 Locked/g)).toHaveLength(6);
    expect(html).not.toContain('TEXT');
  });

  it('one fragment leaves its location incomplete and shows only that value', () => {
    const html = render(['AAA', null, null, null, null, null]);
    expect(html).toContain('AAA');
    expect(html.match(/Incomplete/g)).toHaveLength(3);
    expect(html).not.toContain('TEXT1');
  });

  it('reconstructs a location only when both of its own fragments are held', () => {
    // North of location 1 and South of location 2: no location is complete.
    const mixed = render(['AAA', null, null, 'BBB', null, null]);
    expect(mixed).not.toContain('Reconstructed');
    const html = render(['AAA', 'BBB', null, null, null, null]);
    expect(html).toContain('TEXT1');
    expect(html).not.toContain('TEXT2');
    expect(html.match(/Reconstructed ✓/g)).toHaveLength(1);
  });

  it('shows the completion state with all six fragments', () => {
    const html = render(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(html).toContain('All three locations reconstructed');
    for (const n of [1, 2, 3]) expect(html).toContain(`TEXT${n}`);
  });
});
