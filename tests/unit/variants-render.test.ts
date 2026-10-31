import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canSubmit, challengeAccess, nextPoints } from '@/lib/scoring/points';
import { buildVariant } from '@/lib/variants/derive';
import { render, renderDeep, TemplateError, type RenderContext } from '@/lib/variants/render';
import { commentSafe, jsonForScript, sanitizeHtml } from '@/lib/variants/sanitize';

const flag = 'SPIDEY{47_k3w9qz2m}';
const ctx: RenderContext = { flag, token: 'k3w9qz2m', fragment: '47', rng: () => 0.5 };

describe('render', () => {
  it.each([
    ['{{flag}}', flag],
    ['{{token}}', 'k3w9qz2m'],
    ['{{fragment}}', '47'],
    ['{{flag|base64}}', 'U1BJREVZezQ3X2szdzlxejJtfQ=='],
    ['{{flag|hex}}', Buffer.from(flag).toString('hex')],
    ['{{flag|url}}', 'SPIDEY%7B47_k3w9qz2m%7D'],
    ['{{flag|url2}}', 'SPIDEY%257B47_k3w9qz2m%257D'],
    ['{{flag|rot13}}', 'FCVQRL{47_x3j9dm2z}'],
    ['{{flag|caesar:1}}', 'TQJEFZ{47_l3x9ra2n}'],
    ['{{flag|caesar:-1}}', 'ROHCDX{47_j3v9py2l}'],
    ['{{flag|reverse}}', [...flag].reverse().join('')],
    ['{{flag|sha256}}', createHash('sha256').update(flag).digest('hex')],
    ['{{token|binary}}', '01101011 00110011 01110111 00111001 01110001 01111010 00110010 01101101'],
    ['{{rand:3:9}}', '6'],
  ])('%s', (template, expected) => {
    expect(render(template, ctx)).toBe(expected);
  });

  it('chains transforms left to right and keeps the text around placeholders', () => {
    const chained = render('a {{flag|rot13|base64}} b', ctx);
    const encoded = chained.slice(2, -2);
    expect(render('{{flag|rot13}}', ctx)).toBe(Buffer.from(encoded, 'base64').toString());
  });

  it.each(['{{nope}}', '{{flag|nope}}', '{{flag|caesar}}', '{{rand:9:3}}'])(
    'refuses %s rather than showing raw braces',
    (template) => {
      expect(() => render(template, ctx)).toThrow(TemplateError);
    },
  );

  it('refuses {{flag}} in static mode and {{fragment}} without a fragment', () => {
    expect(() => render('{{flag}}', { ...ctx, flag: null })).toThrow(TemplateError);
    expect(() => render('{{fragment}}', { ...ctx, fragment: null })).toThrow(TemplateError);
  });

  it('renders every string in a nested value', () => {
    expect(renderDeep({ a: ['{{token}}', 1], b: { c: '{{fragment}}' } }, ctx)).toEqual({
      a: ['k3w9qz2m', 1],
      b: { c: '47' },
    });
  });
});

describe('buildVariant', () => {
  const keys = {
    variantKey: Buffer.alloc(32, 1).toString('base64'),
    flagKey: Buffer.alloc(32, 2).toString('base64'),
    flagPrefix: 'SPIDEY',
  };
  const challenge = {
    id: 'c1',
    generatorKey: 'template',
    questionTemplate: '{{flag|base64}} {{rand:1:1000000}} {{rand_word}}',
    evidence: [{ type: 'code', content: '{{token}}' }],
    generatorConfig: {
      surfaces: { cookies: [{ name: 'clue_a', value: '{{rand:1:9}}' }] },
      files: [{ name: 'a.txt', content: '{{flag|hex}}' }],
    },
    flagMode: 'team',
    flagTemplate: '{{fragment}}_{{token}}',
    staticFlagHash: null,
    fragmentValue: '47',
  };

  it('is deterministic per team, differs between teams, and hides the plaintext flag', () => {
    const a = buildVariant('t1', challenge, keys);
    expect(buildVariant('t1', challenge, keys)).toEqual(a);
    const b = buildVariant('t2', challenge, keys);
    expect(b.variantData.html).not.toBe(a.variantData.html);
    expect(b.expectedFlagHash).not.toBe(a.expectedFlagHash);
    expect(JSON.stringify(a.variantData)).not.toContain(a.flag);
    expect(a.flag).toMatch(/^SPIDEY\{47_/);
  });

  it('uses the stored hash in static mode', () => {
    const variant = buildVariant(
      't1',
      {
        ...challenge,
        questionTemplate: '{{token}}',
        evidence: [],
        generatorConfig: {},
        flagMode: 'static',
        flagTemplate: null,
        staticFlagHash: 'stored',
      },
      keys,
    );
    expect(variant).toMatchObject({ flag: null, expectedFlagHash: 'stored' });
  });

  it.each([
    [{ cookies: [{ name: 'st_session', value: 'x' }] }],
    [{ headers: [{ name: 'set-cookie', value: 'x' }] }],
    [{ headers: [{ name: 'x-spidey-a', value: 'x\r\ninjected: y' }] }],
  ])('refuses unsafe surface %j', (surfaces) => {
    expect(() => buildVariant('t1', { ...challenge, generatorConfig: { surfaces } }, keys)).toThrow(
      TemplateError,
    );
  });

  it('refuses a generator that does not exist yet', () => {
    expect(() => buildVariant('t1', { ...challenge, generatorKey: 'log-file' }, keys)).toThrow(
      TemplateError,
    );
  });
});

describe('sanitizeHtml', () => {
  it('keeps the inspect markup TRD §9 allows', () => {
    const html =
      '<p class="a">x</p><!-- clue --><div hidden="" data-clue="1">y</div>' +
      '<meta name="clue" content="z"><template><b>t</b></template>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it.each([
    ['<script>alert(1)</script>', 'alert(1)'],
    ['<SCRIPT SRC=//x></SCRIPT>', ''],
    ['<img src=/x.png onerror=alert(1)>', '<img src="/x.png">'],
    ['<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
    ['<a href=" JaVaScRiPt:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="java&#115;cript:alert(1)">x</a>', '<a>x</a>'],
    ['<iframe src="https://x"></iframe>', ''],
    ['<meta http-equiv="refresh" content="0;url=https://x">', '<meta content="0;url=https://x">'],
    ['<p style="position:fixed">x</p>', '<p>x</p>'],
    ['<!--><script>alert(1)</script>-->', ''],
    ['<!-- a --!><script>alert(1)</script>-->', ''],
    ['<!-- unterminated', '&lt;!-- unterminated'],
    ['1 < 2', '1 &lt; 2'],
    ['<p title="a>b" onclick="x">', '<p title="a&gt;b">'],
    ['<svg onload=alert(1)>', ''],
    ['<<script>script>', '&lt;script>'],
  ])('%s', (input, expected) => {
    expect(sanitizeHtml(input)).toBe(expected);
  });

  it('commentSafe cannot close a comment and jsonForScript cannot close a script', () => {
    expect(commentSafe('a --> b')).not.toContain('>');
    expect(jsonForScript({ a: '</script>' })).not.toContain('<');
    expect(JSON.parse(jsonForScript({ a: '</script>' }))).toEqual({ a: '</script>' });
  });
});

describe('points and access', () => {
  it('shows the next solve as base minus 0.5 per earlier solve, never below zero', () => {
    expect(nextPoints(60, 0)).toBe(60);
    expect(nextPoints(60, 1)).toBe(59.5);
    expect(nextPoints(60, 5)).toBe(57.5);
    expect(nextPoints(400, 3)).toBe(398.5);
    expect(nextPoints(1, 4)).toBe(0);
  });

  it('locks before the event starts, closes after it ends, and stays readable while paused', () => {
    expect(challengeAccess('not_started')).toBe('locked');
    expect(challengeAccess('running')).toBe('open');
    expect(challengeAccess('paused')).toBe('open');
    expect(challengeAccess('ended')).toBe('closed');
  });

  it('accepts submissions only while running and switched on', () => {
    expect(canSubmit('running', true)).toBe(true);
    expect(canSubmit('running', false)).toBe(false);
    expect(canSubmit('paused', true)).toBe(false);
    expect(canSubmit('not_started', true)).toBe(false);
    expect(canSubmit('ended', true)).toBe(false);
  });
});
