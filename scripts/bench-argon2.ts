// TRD §5.1: one hash, then 100 concurrent hashes in-process, for each profile on the fallback ladder.
import { hash } from '@node-rs/argon2';

const PROFILES = [
  { memoryCost: 19456, timeCost: 2, parallelism: 1 },
  { memoryCost: 12288, timeCost: 3, parallelism: 1 },
  { memoryCost: 9216, timeCost: 4, parallelism: 1 },
];
const CONCURRENT = 100;

async function timed(options: (typeof PROFILES)[number]): Promise<number> {
  const start = performance.now();
  await hash('bench-password-not-a-secret', options);
  return performance.now() - start;
}

async function main() {
  const rows = [];
  for (const profile of PROFILES) {
    const single = await timed(profile);
    const parallel = await Promise.all(Array.from({ length: CONCURRENT }, () => timed(profile)));
    parallel.sort((a, b) => a - b);
    rows.push({
      profile: `m=${profile.memoryCost} t=${profile.timeCost} p=${profile.parallelism}`,
      single_ms: Math.round(single),
      p50_ms: Math.round(parallel[Math.floor(CONCURRENT * 0.5)]),
      p95_ms: Math.round(parallel[Math.floor(CONCURRENT * 0.95)]),
    });
  }
  console.table(rows);
  console.log(`UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE ?? '4 (default)'}`);
}

void main();
