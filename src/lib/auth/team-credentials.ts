import { randomBytes } from 'node:crypto';

import { base32 } from '@/lib/crypto/tokens';

// docs/07 §2: the password is the team name, lowercased, spaces removed, reversed.
// shortcut: derivable from the public team name, so the hidden team code is the only real barrier.
// Replace with an organiser-printed secret if that is ever not acceptable.
export function teamPassword(teamName: string): string {
  return [...teamName.toLowerCase().replace(/\s+/g, '')].reverse().join('');
}

// Shown only on the organisers' slip, never on a public page.
export function teamCode(): string {
  return `sp-${base32(randomBytes(5)).slice(0, 7)}`;
}
