// Integration tests wipe the one dev database, so runs from different worktrees must take turns.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireTestLock } from './test-lock';

export default async function setup(): Promise<(() => void) | void> {
  // Only a run of nothing but unit tests may skip the wait: it touches no database.
  const paths = process.argv.slice(2).filter((arg) => arg.startsWith('tests/'));
  if (paths.length > 0 && paths.every((path) => path.startsWith('tests/unit'))) return;
  return acquireTestLock(join(tmpdir(), 'spidey-ctf-test-run.lock'));
}
