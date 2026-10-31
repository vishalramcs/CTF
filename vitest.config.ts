import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // tsconfig says jsx: preserve for Next.js; component tests need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/{unit,integration}/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests share one database and wipe it.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
