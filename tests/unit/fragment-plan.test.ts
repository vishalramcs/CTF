import { describe, expect, it } from 'vitest';

import { checkFragmentPlan, coordinateMismatches } from '@/lib/admin/coordinates';

const difficulty = new Map([
  ['e1', 'easy'],
  ['e2', 'easy'],
  ['e3', 'easy'],
  ['m1', 'medium'],
  ['m2', 'medium'],
  ['d1', 'difficult'],
  ['d2', 'difficult'],
  ['main', 'main_difficult'],
]);
const plan = (ids: string[]) => ids.map((challengeId, i) => ({ challengeId, order: i + 1 }));

describe('checkFragmentPlan', () => {
  it('accepts none, or exactly 2 Easy, 2 Medium, 2 Difficult with orders 1-6', () => {
    expect(checkFragmentPlan([], difficulty)).toBeNull();
    expect(checkFragmentPlan(plan(['e1', 'e2', 'm1', 'm2', 'd1', 'd2']), difficulty)).toBeNull();
  });

  it('refuses any other split, repeats, repeated orders and the Main Question', () => {
    const check = (ids: string[]) => checkFragmentPlan(plan(ids), difficulty);
    expect(check(['e1', 'e2', 'e3', 'm1', 'd1', 'd2'])).toMatch(/2 Easy/);
    expect(check(['e1', 'e2', 'm1', 'm2', 'd1'])).toMatch(/exactly 6/);
    expect(check(['e1', 'e1', 'm1', 'm2', 'd1', 'd2'])).toMatch(/twice/);
    expect(check(['e1', 'e2', 'm1', 'm2', 'd1', 'main'])).toMatch(/Main/);
    const dup = plan(['e1', 'e2', 'm1', 'm2', 'd1', 'd2']).map((p, i) =>
      i === 5 ? { ...p, order: 1 } : p,
    );
    expect(checkFragmentPlan(dup, difficulty)).toMatch(/order/);
  });

  it('keeps each pair on its own coordinate, in either order within the pair', () => {
    expect(checkFragmentPlan(plan(['e2', 'e1', 'm2', 'm1', 'd2', 'd1']), difficulty)).toBeNull();
    expect(checkFragmentPlan(plan(['e1', 'm1', 'e2', 'm2', 'd1', 'd2']), difficulty)).toMatch(
      /Easy uses orders 1-2/,
    );
  });
});

describe('coordinateMismatches', () => {
  const fragments = [
    { order: 2, value: '0168' },
    { order: 1, value: '11.' },
    { order: 3, value: '76.' },
    { order: 4, value: '9558' },
  ];

  it('joins each pair in order and reports only the coordinates that differ', () => {
    expect(
      coordinateMismatches(fragments, [
        { position: 1, value: '11.0168' },
        { position: 2, value: '76.0000' },
      ]),
    ).toEqual([2]);
  });

  it('skips a coordinate whose pair is not fully assigned', () => {
    expect(coordinateMismatches(fragments, [{ position: 3, value: '42' }])).toEqual([]);
    expect(coordinateMismatches([], [{ position: 1, value: '11' }])).toEqual([]);
  });
});
