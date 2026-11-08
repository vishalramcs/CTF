import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CoordinateBoard } from '@/components/coordinates/coordinate-board';
import { fragmentId } from '@/lib/coordinates/fragments';
import { normalizeFinal } from '@/lib/coordinates/normalize';
import type { CoordinateBoard as BoardData } from '@/lib/coordinates/state';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const slot = (order: number, value: string | null) => ({
  id: fragmentId(order),
  held: value !== null,
  value,
  from: value === null ? null : order,
});

// `values` is the fragment held in each slot 1-6, or null.
function board(
  values: (string | null)[],
  answered = true,
  signal: BoardData['signal'] = null,
): BoardData {
  const locations = [1, 2, 3].map((position) => {
    const north = slot(2 * position - 1, values[2 * position - 2]);
    const south = slot(2 * position, values[2 * position - 1]);
    const reconstructed = north.held && south.held;
    return {
      position,
      north,
      south,
      reconstructed,
      answered: reconstructed && answered,
      label: reconstructed && answered ? `PLACE${position}` : null,
      text: reconstructed ? `TEXT${position}` : null,
    };
  });
  return {
    slots: 6,
    locationPoints: 25,
    fragments: [],
    locations,
    finalCoordinates: null,
    found: false,
    signal,
  };
}

const render = (values: (string | null)[], answered = true) =>
  renderToStaticMarkup(createElement(CoordinateBoard, { board: board(values, answered) }));

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
  it('asks for the place name once a location is rebuilt, and hides it until answered', () => {
    const html = render(['AAA', 'BBB', null, null, null, null], false);
    expect(html).toContain('Name the place for +25');
    expect(html).not.toContain('PLACE1');
    expect(html.match(/Name the place/g)).toHaveLength(1);
    const done = render(['AAA', 'BBB', null, null, null, null], true);
    expect(done).not.toContain('Name the place');
    expect(done).toContain('Place named');
  });

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

  it('shows the space signal, catalogue and answer box only when the server sends a signal', () => {
    const none = render(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(none).not.toContain('Space signal');
    expect(none).not.toContain('/api/coordinates/catalog');
    const all = ['A', 'B', 'C', 'D', 'E', 'F'];
    const html = renderToStaticMarkup(
      createElement(CoordinateBoard, {
        board: board(all, true, { text: 'SIGNAL-TEXT', points: 100, found: false }),
      }),
    );
    expect(html).toContain('SIGNAL-TEXT');
    expect(html).toContain('/api/coordinates/catalog');
    expect(html).toContain('Name the object for +100');
    const found = renderToStaticMarkup(
      createElement(CoordinateBoard, {
        board: board(all, true, { text: 'SIGNAL-TEXT', points: 100, found: true }),
      }),
    );
    expect(found).toContain('Signal traced');
    expect(found).not.toContain('Name the object');
  });
});

describe('normalizeFinal', () => {
  it('ignores case, punctuation and spaces', () => {
    expect(normalizeFinal('NGC 7000')).toBe('ngc7000');
    expect(normalizeFinal(' n.g.c.7000 ')).toBe('ngc7000');
    expect(normalizeFinal('North  America!')).toBe('northamerica');
    expect(normalizeFinal(' .. ')).toBeNull();
  });
});
