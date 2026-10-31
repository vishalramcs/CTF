import { describe, expect, it } from 'vitest';

import { teamPassword } from '@/lib/auth/team-credentials';

describe('teamPassword', () => {
  it('lowercases, drops spaces and reverses the team name', () => {
    expect(teamPassword('Web Slingers')).toBe('sregnilsbew');
    expect(teamPassword('  Test Team 01 ')).toBe('10maettset');
  });

  it('keeps multi-byte characters whole', () => {
    expect(teamPassword('Spidér')).toBe('rédips');
  });
});
