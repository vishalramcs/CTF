import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacBytes(keyBase64: string, message: string): Buffer {
  return createHmac('sha256', Buffer.from(keyBase64, 'base64')).update(message).digest();
}

export function hmacHex(keyBase64: string, message: string): string {
  return hmacBytes(keyBase64, message).toString('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // Empty never matches: submissions store '' as the hash of a malformed attempt.
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
