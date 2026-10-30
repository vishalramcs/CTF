import { createHash, randomBytes } from 'node:crypto';

// Crockford base32, lowercase: no i, l, o or u, so tokens are easy to copy by hand.
const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

export function base32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return bits > 0 ? out + BASE32[(buffer << (5 - bits)) & 31] : out;
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string, pepper: string): string {
  return createHash('sha256')
    .update(token + pepper)
    .digest('hex');
}

// 12 base32 characters = 60 random bits (TRD §5.1).
export function generatePassword(): string {
  return base32(randomBytes(8)).slice(0, 12);
}
