import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { csrfToken, isValidCsrf } from '@/lib/auth/csrf';
import { isSessionEndReason, safeNext, SESSION_COOKIE } from '@/lib/auth/shared';
import { clientIp } from '@/lib/http';
import { middleware } from '@/middleware';

describe('csrf', () => {
  it('is stable per session and differs between sessions', () => {
    expect(csrfToken('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(csrfToken('a')).toBe(csrfToken('a'));
    expect(csrfToken('a')).not.toBe(csrfToken('b'));
  });

  it('accepts only the token of that session', () => {
    expect(isValidCsrf('a', csrfToken('a'))).toBe(true);
    expect(isValidCsrf('a', csrfToken('b'))).toBe(false);
    expect(isValidCsrf('a', '')).toBe(false);
    expect(isValidCsrf('a', null)).toBe(false);
  });
});

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/challenge/3?tab=a', '/x')).toBe('/challenge/3?tab=a');
    expect(safeNext('/', '/x')).toBe('/');
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'evil.com',
    '',
    undefined,
    ['/a'],
  ])('rejects %j', (value) => {
    expect(safeNext(value, '/x')).toBe('/x');
  });
});

describe('isSessionEndReason', () => {
  it('rejects anything unknown, including inherited keys', () => {
    expect(isSessionEndReason('evicted')).toBe(true);
    expect(isSessionEndReason('none')).toBe(false);
    expect(isSessionEndReason('toString')).toBe(false);
  });
});

describe('clientIp', () => {
  const withHeader = (value: string) =>
    new NextRequest('http://t/', { headers: { 'x-forwarded-for': value } });

  it('takes the first address and drops anything that is not an IP', () => {
    expect(clientIp(withHeader('203.0.113.9, 10.0.0.1'))).toBe('203.0.113.9');
    expect(clientIp(withHeader('::1'))).toBe('::1');
    expect(clientIp(withHeader("'; DROP TABLE x"))).toBeNull();
    expect(clientIp(new NextRequest('http://t/'))).toBeNull();
  });
});

describe('middleware', () => {
  const run = (path: string, cookie = false) =>
    middleware(
      new NextRequest(`http://t${path}`, {
        headers: cookie ? { cookie: `${SESSION_COOKIE}=x` } : {},
      }),
    );

  it('sends a team page without a cookie to /login and remembers where it was', () => {
    expect(run('/challenge/3?a=1').headers.get('location')).toBe(
      'http://t/login?next=%2Fchallenge%2F3%3Fa%3D1',
    );
  });

  it('sends admin pages and the projector to /admin/login', () => {
    expect(run('/admin/teams').headers.get('location')).toBe('http://t/admin/login');
    expect(run('/screen').headers.get('location')).toBe('http://t/admin/login');
  });

  it('never redirects /admin/login, and lets a cookie through for the real guard to judge', () => {
    expect(run('/admin/login').headers.get('location')).toBeNull();
    expect(run('/dashboard', true).headers.get('location')).toBeNull();
  });
});
