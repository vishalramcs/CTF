import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { normalizeFlag } from '@/lib/flags/normalize';
import { checkFlag } from '@/lib/flags/verify';
import { buildTeamFlag, deriveSeed, expectedFlagHash, teamToken } from '@/lib/variants/derive';
import { placeholderGenerator } from '@/lib/variants/generators/placeholder';

const keys = {
  variantKey: randomBytes(32).toString('base64'),
  flagKey: randomBytes(32).toString('base64'),
  flagPrefix: 'SPIDEY',
};

describe('normalizeFlag', () => {
  it.each([
    ['SPIDEY{abc}', 'SPIDEY{abc}'],
    ['spidey{ABC}', 'SPIDEY{abc}'],
    ['  SPIDEY{abc}\n', 'SPIDEY{abc}'],
    ['SPIDEY{  abc  }', 'SPIDEY{abc}'],
  ])('accepts %j', (input, expected) => {
    expect(normalizeFlag(input, 'SPIDEY')).toBe(expected);
  });

  it.each(['abc', 'OTHER{abc}', 'SPIDEY{abc', 'SPIDEYabc}', '{abc}', ''])('rejects %j', (input) => {
    expect(normalizeFlag(input, 'SPIDEY')).toBeNull();
  });
});

describe('variants', () => {
  const tokenFor = (team: string, challenge: string) =>
    teamToken(deriveSeed(keys.variantKey, team, challenge));

  it('is deterministic and differs by team and challenge', () => {
    expect(tokenFor('t1', 'c1')).toBe(tokenFor('t1', 'c1'));
    expect(tokenFor('t1', 'c1')).not.toBe(tokenFor('t2', 'c1'));
    expect(tokenFor('t1', 'c1')).not.toBe(tokenFor('t1', 'c2'));
    expect(tokenFor('t1', 'c1')).toMatch(/^[0-9a-z]{8}$/);
  });

  it('keeps the fragment identical across teams while the flag differs', () => {
    const template = '{{fragment}}_{{token}}';
    const a = buildTeamFlag('SPIDEY', template, { token: tokenFor('t1', 'c'), fragment: '47' });
    const b = buildTeamFlag('SPIDEY', template, { token: tokenFor('t2', 'c'), fragment: '47' });
    expect(a).toMatch(/^SPIDEY\{47_[0-9a-z]{8}\}$/);
    expect(b).toMatch(/^SPIDEY\{47_[0-9a-z]{8}\}$/);
    expect(a).not.toBe(b);
  });

  it('accepts the flag in any case but not another team flag', () => {
    const flag = buildTeamFlag('SPIDEY', '{{token}}', { token: 'k3w9qz2m', fragment: null });
    const other = buildTeamFlag('SPIDEY', '{{token}}', { token: 'aaaaaaaa', fragment: null });
    expect(expectedFlagHash(flag.toUpperCase(), keys)).toBe(expectedFlagHash(flag, keys));
    expect(expectedFlagHash(other, keys)).not.toBe(expectedFlagHash(flag, keys));
  });

  it('placeholder clue decodes back to the exact flag and hides the plaintext', () => {
    const flag = 'SPIDEY{47_k3w9qz2m}';
    const { html } = placeholderGenerator(
      { questionTemplate: '<p>{{flag|base64}}</p>', evidence: [], generatorConfig: {} },
      { flag, token: 'k3w9qz2m', fragment: '47', rng: () => 0 },
    );
    expect(html).not.toContain(flag);
    const encoded = html.replace(/<\/?p>/g, '');
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(flag);
  });
});

describe('checkFlag', () => {
  const flag = 'SPIDEY{47_k3w9qz2m}';
  const expected = expectedFlagHash(flag, keys);

  it.each([flag, 'spidey{47_K3W9QZ2M}', `  ${flag}\n`, 'SPIDEY{  47_k3w9qz2m }'])(
    'accepts %j',
    (input) => {
      expect(checkFlag(input, expected, keys).result).toBe('correct');
    },
  );

  it('rejects a well-formed wrong flag, keeping its hash', () => {
    const { result, hash } = checkFlag('SPIDEY{nope}', expected, keys);
    expect(result).toBe('wrong');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(['OTHER{47_k3w9qz2m}', '47_k3w9qz2m', 'SPIDEY{47_k3w9qz2m', ''])(
    'treats %j as malformed, with no hash',
    (input) => {
      expect(checkFlag(input, expected, keys)).toEqual({ result: 'malformed', hash: '' });
    },
  );

  it('never matches an empty expected hash', () => {
    expect(checkFlag(flag, '', keys).result).toBe('wrong');
  });
});
