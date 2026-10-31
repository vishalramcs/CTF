import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CoordinateBoard } from '@/components/coordinates/coordinate-board';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('@/components/participant/answer-form', () => ({ AnswerForm: () => null }));

const fragment = (number: number, difficulty: string, value: string) => ({
  number,
  title: `Q${number}`,
  difficulty: difficulty as 'easy',
  value,
  orderClue: null,
});

const render = (fragments: ReturnType<typeof fragment>[]) =>
  renderToStaticMarkup(
    createElement(CoordinateBoard, {
      board: { slots: 6, fragments, finalCoordinates: null, found: false },
    }),
  );

// The markup between one coordinate's heading and the next.
const card = (html: string, n: number) =>
  html.slice(html.indexOf(`Coordinate ${n}`), html.indexOf(`Coordinate ${n + 1}`));

describe('CoordinateBoard', () => {
  it('puts each fragment on the coordinate of its difficulty and ticks a full pair', () => {
    const html = render([
      fragment(1, 'easy', 'AAA'),
      fragment(3, 'easy', 'BBB'),
      fragment(5, 'medium', 'CCC'),
    ]);
    expect(card(html, 1)).toMatch(/AAA[\s\S]*BBB/);
    expect(card(html, 1)).toContain('✓');
    expect(card(html, 2)).toContain('CCC');
    expect(card(html, 2)).not.toContain('✓');
    expect(html).toContain('3/6');
    expect(html.match(/🔒 Empty/g)).toHaveLength(3);
  });
});
