import { hmacBytes, hmacHex } from '@/lib/crypto/hmac';
import { base32 } from '@/lib/crypto/tokens';
import { normalizeFlag } from '@/lib/flags/normalize';
import { getGenerator } from '@/lib/variants/generators';
import type { GeneratorInput, VariantData } from '@/lib/variants/generators/template';

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

// TRD §8.2: the seeded PRNG behind {{rand:..}} and {{rand_word}}. Returns [0, 1).
export function sfc32(seed: Buffer): () => number {
  let [a, b, c, d] = [0, 4, 8, 12].map((offset) => seed.readUInt32LE(offset));
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export type VariantChallenge = GeneratorInput & {
  id: string;
  generatorKey: string;
  flagMode: string;
  flagTemplate: string | null;
  staticFlagHash: string | null;
  fragmentValue: string | null;
};

// TRD §8.2. A pure function of (team, challenge). `flag` is for the seed's dev CSV only: don't
// store or return it anywhere else. Null in static mode, where only the HMAC exists.
export function buildVariant(
  teamId: string,
  challenge: VariantChallenge,
  keys: VariantKeys,
): { flag: string | null; variantData: VariantData; expectedFlagHash: string } {
  const seed = deriveSeed(keys.variantKey, teamId, challenge.id);
  const token = teamToken(seed);
  const fragment = challenge.fragmentValue;
  const flag =
    challenge.flagMode === 'team'
      ? buildTeamFlag(keys.flagPrefix, challenge.flagTemplate!, { token, fragment })
      : null;
  return {
    flag,
    variantData: getGenerator(challenge.generatorKey)(challenge, {
      flag,
      token,
      fragment,
      rng: sfc32(seed),
    }),
    expectedFlagHash: flag ? expectedFlagHash(flag, keys) : challenge.staticFlagHash!,
  };
}
