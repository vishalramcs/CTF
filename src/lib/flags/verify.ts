import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { normalizeFlag } from '@/lib/flags/normalize';

export type FlagCheck = { result: 'correct' | 'wrong' | 'malformed'; hash: string };

// TRD §8.1. A malformed attempt computes no hash, and '' is what its attempt row stores.
export function checkFlag(
  input: string,
  expectedHash: string,
  keys: { flagKey: string; flagPrefix: string },
): FlagCheck {
  const normalized = normalizeFlag(input, keys.flagPrefix);
  if (!normalized) return { result: 'malformed', hash: '' };
  const hash = hmacHex(keys.flagKey, normalized);
  return { result: safeEqual(hash, expectedHash) ? 'correct' : 'wrong', hash };
}
