import { randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isWipeable } from '@/lib/db/wipe';

const secret = () => randomBytes(32).toString('base64');
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  DATABASE_URL: 'postgresql://u:p@localhost:6543/postgres',
  DIRECT_DATABASE_URL: 'postgresql://u:p@localhost:5432/postgres',
  SESSION_PEPPER: secret(),
  FLAG_HMAC_KEY: secret(),
  VARIANT_HMAC_KEY: secret(),
  COORD_HMAC_KEY: secret(),
  REVEAL_ENC_KEY: secret(),
  CSRF_SECRET: secret(),
  FLAG_PREFIX: 'SPIDEY',
  EVENT_TIMEZONE: 'Asia/Kolkata',
  MAX_SESSIONS_PER_TEAM: '2',
  REALTIME_CHANNEL_PREFIX: 'spidey',
  ARGON2_MEMORY_KIB: '19456',
  ARGON2_TIME_COST: '2',
  ARGON2_PARALLELISM: '1',
};

async function loadEnvWith(values: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...valid, ...values })) vi.stubEnv(name, value);
  return (await import('@/lib/env')).env;
}

afterEach(() => vi.unstubAllEnvs());

describe('env', () => {
  it('parses a complete environment and coerces numbers', async () => {
    const env = await loadEnvWith({});
    expect(env.MAX_SESSIONS_PER_TEAM).toBe(2);
  });

  it('fails when a value is missing, without printing secrets', async () => {
    const leaked = secret();
    const error = await loadEnvWith({ FLAG_HMAC_KEY: '', SESSION_PEPPER: leaked }).catch(
      (e: Error) => e,
    );
    expect((error as Error).message).toMatch(/FLAG_HMAC_KEY/);
    expect((error as Error).message).not.toContain(leaked);
  });

  it('hashes passwords as Argon2id with the configured cost', async () => {
    await loadEnvWith({ ARGON2_MEMORY_KIB: '12288', ARGON2_TIME_COST: '3' });
    const { hashPassword } = await import('@/lib/auth/password');
    expect(await hashPassword('correct horse')).toMatch(/^\$argon2id\$v=19\$m=12288,t=3,p=1\$/);
  });

  it('rejects an AES key that is not exactly 32 bytes', async () => {
    const long = randomBytes(48).toString('base64');
    await expect(loadEnvWith({ REVEAL_ENC_KEY: long })).rejects.toThrow(/REVEAL_ENC_KEY/);
  });
});

describe('isWipeable', () => {
  it('allows local databases', () => {
    expect(isWipeable('postgresql://postgres:p@127.0.0.1:54322/postgres', undefined)).toBe(true);
    expect(isWipeable('postgresql://postgres:p@localhost:5432/postgres', undefined)).toBe(true);
  });

  it('allows only the named project', () => {
    const pooler = 'postgresql://postgres.devref:p@aws-1-ap-south-1.pooler.supabase.com:5432/db';
    const direct = 'postgresql://postgres:p@db.devref.supabase.co:5432/postgres';
    expect(isWipeable(pooler, 'devref')).toBe(true);
    expect(isWipeable(direct, 'devref')).toBe(true);
    expect(isWipeable(pooler, 'prodref')).toBe(false);
    expect(isWipeable(direct, 'prodref')).toBe(false);
    expect(isWipeable(pooler, undefined)).toBe(false);
    expect(isWipeable(pooler, '')).toBe(false);
  });
});
