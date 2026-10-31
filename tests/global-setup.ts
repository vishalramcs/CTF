// Integration tests wipe the one dev database, so runs from different worktrees must take turns.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireTestLock } from './test-lock';

export default async function setup(): Promise<(() => void) | void> {
  // Unit-only runs touch no database, so they don't need to wait.
  if (process.argv.some((arg) => arg.includes('tests/unit'))) return;
  return acquireTestLock(join(tmpdir(), 'spidey-ctf-test-run.lock'));
}
