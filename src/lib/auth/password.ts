import { hash } from '@node-rs/argon2';

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
