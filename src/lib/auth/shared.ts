// Safe for the browser and the edge runtime: no env, no database.

export const SESSION_COOKIE = 'st_session';

export const SESSION_ENDED_MESSAGES = {
  evicted: 'Your team logged in on another device. This session ended.',
  admin: 'Session ended by admin.',
  password_reset: 'Your password was reset. Log in with the new one.',
  team_disabled: 'This team is disabled. Ask an organiser.',
  expired: 'Your session expired. Log in again.',
  logout: 'You logged out.',
} as const;

export type SessionEndReason = keyof typeof SESSION_ENDED_MESSAGES;

export function isSessionEndReason(value: unknown): value is SessionEndReason {
  return typeof value === 'string' && Object.hasOwn(SESSION_ENDED_MESSAGES, value);
}

// Only same-site paths. Browsers treat `\` as `/` and strip control characters, so `/\evil.com`
// and `/<tab>/evil.com` would otherwise leave the site.
export function safeNext(next: unknown, fallback: string): string {
  return typeof next === 'string' && /^\/(?!\/)[^\\\x00-\x1f]*$/.test(next) ? next : fallback;
}
