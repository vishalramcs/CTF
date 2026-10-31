import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// A lock file, not a database lock: the Supavisor pooler keeps a session advisory lock alive after
// its client dies, and waiting on one is cancelled by the 2-minute statement timeout.
// shortcut: two waiters clearing the same stale file at once could let two runs through. Rare, and
// only on one developer machine; move to a lease row if runs ever span machines.
export async function acquireTestLock(path: string, pollMs = 2000): Promise<() => void> {
  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return () => rmSync(path, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }

    let holder = 0;
    try {
      holder = Number(readFileSync(path, 'utf8'));
    } catch {
      continue; // Released between the two calls.
    }
    // 0 means the holder has created the file but not written its pid yet.
    if (holder && !isAlive(holder)) {
      rmSync(path, { force: true });
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
