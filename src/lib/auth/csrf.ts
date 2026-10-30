import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { env } from '@/lib/env';

export function csrfToken(sessionId: string): string {
  return hmacHex(env.CSRF_SECRET, `csrf:${sessionId}`);
}

export function isValidCsrf(sessionId: string, header: string | null): boolean {
  return safeEqual(csrfToken(sessionId), header ?? '');
}
