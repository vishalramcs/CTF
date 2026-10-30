import { hash, verify } from '@node-rs/argon2';

import { randomToken } from '@/lib/crypto/tokens';
import { env } from '@/lib/env';

// The library defaults to Argon2id (asserted in tests): its Algorithm const enum can't be
// imported under isolatedModules.
export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: env.ARGON2_MEMORY_KIB,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
  });
}

// Parameters come from the encoded hash, so old hashes keep verifying after a tuning change.
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

let unknownUserHash: Promise<string> | undefined;

// Spends the same time as a real check, so response time doesn't reveal which usernames exist.
export async function verifyAgainstNothing(password: string): Promise<false> {
  unknownUserHash ??= hashPassword(randomToken());
  await verify(await unknownUserHash, password);
  return false;
}
