import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decrypt, encrypt } from '@/lib/crypto/aead';
import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { base32, generatePassword, hashSessionToken, randomToken } from '@/lib/crypto/tokens';

const key = randomBytes(32).toString('base64');

describe('hmac', () => {
  it('matches the RFC 4231 test case 2 vector', () => {
    const jefe = Buffer.from('Jefe').toString('base64');
    expect(hmacHex(jefe, 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('safeEqual compares exactly and never matches empty strings', () => {
    expect(safeEqual('abcd', 'abcd')).toBe(true);
    expect(safeEqual('abcd', 'abce')).toBe(false);
    expect(safeEqual('abcd', 'abcdef')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('aead', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encrypt(key, 'spider');
    expect(decrypt(key, a)).toBe('spider');
    expect(encrypt(key, 'spider')).not.toBe(a);
  });

  it('rejects tampered ciphertext and the wrong key', () => {
    const raw = Buffer.from(encrypt(key, 'spider'), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(key, raw.toString('base64'))).toThrow();
    expect(() => decrypt(randomBytes(32).toString('base64'), encrypt(key, 'x'))).toThrow();
  });
});

describe('tokens', () => {
  it('encodes Crockford base32', () => {
    expect(base32(new Uint8Array([0, 0, 0, 0, 0]))).toBe('00000000');
    expect(base32(new Uint8Array([255, 255, 255, 255, 255]))).toBe('zzzzzzzz');
    expect(base32(new Uint8Array([0xf8]))).toBe('z0');
  });

  it('session token hash is peppered, hex and deterministic', () => {
    const token = randomToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hashSessionToken(token, 'a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token, 'a')).toBe(hashSessionToken(token, 'a'));
    expect(hashSessionToken(token, 'a')).not.toBe(hashSessionToken(token, 'b'));
  });

  it('generates 12-character passwords without confusable letters', () => {
    expect(generatePassword()).toMatch(/^[0-9a-hjkmnp-tv-z]{12}$/);
  });
});
