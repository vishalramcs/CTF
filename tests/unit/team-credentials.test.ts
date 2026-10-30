import { describe, expect, it } from 'vitest';

import { teamCode, teamPassword } from '@/lib/auth/team-credentials';

describe('teamPassword', () => {
  it('lowercases, drops spaces and reverses the team name', () => {
    expect(teamPassword('Web Slingers')).toBe('sregnilsbew');
    expect(teamPassword('  Test Team 01 ')).toBe('10maettset');
  });

  it('keeps multi-byte characters whole', () => {
    expect(teamPassword('Spidér')).toBe('rédips');
  });
});

describe('teamCode', () => {
  it('is hidden-friendly: prefixed, lowercase base32, and different each time', () => {
    const codes = new Set(Array.from({ length: 50 }, teamCode));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^sp-[0-9a-hjkmnp-tv-z]{7}$/);
  });
});
