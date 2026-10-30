import { hmacBytes, hmacHex } from '@/lib/crypto/hmac';
import { base32 } from '@/lib/crypto/tokens';
import { normalizeFlag } from '@/lib/flags/normalize';

export type VariantKeys = {
  variantKey: string;
  flagKey: string;
  flagPrefix: string;
};

export function deriveSeed(variantKey: string, teamId: string, challengeId: string): Buffer {
  return hmacBytes(variantKey, `${teamId}:${challengeId}`);
}

export function teamToken(seed: Uint8Array): string {
  return base32(seed.subarray(0, 5));
}

// TRD §8.2, team flag mode. Fragments come from the challenge, so they match for every team.
export function buildTeamFlag(
  flagPrefix: string,
  flagTemplate: string,
  values: { token: string; fragment: string | null },
): string {
  const inner = flagTemplate
    .replaceAll('{{token}}', values.token)
    .replaceAll('{{fragment}}', values.fragment ?? '');
  return `${flagPrefix}{${inner.toLowerCase()}}`;
}

export function expectedFlagHash(flag: string, keys: VariantKeys): string {
  const normalized = normalizeFlag(flag, keys.flagPrefix);
  if (!normalized) throw new Error('Generated flag failed normalisation');
  return hmacHex(keys.flagKey, normalized);
}
