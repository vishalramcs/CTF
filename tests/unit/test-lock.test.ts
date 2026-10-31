import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireTestLock } from '../test-lock';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spidey-lock-'));
  path = join(dir, 'lock');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('acquireTestLock', () => {
  it('records the holder and removes the file on release', async () => {
    const release = await acquireTestLock(path);
    expect(readFileSync(path, 'utf8')).toBe(String(process.pid));
    release();
    expect(existsSync(path)).toBe(false);
  });

  it('makes a second run wait until the first releases', async () => {
    const release = await acquireTestLock(path, 10);
    let acquired = false;
    const second = acquireTestLock(path, 10).then((r) => {
      acquired = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(acquired).toBe(false);
    release();
    (await second)();
    expect(acquired).toBe(true);
  });

  it('takes over from a run that died without releasing', async () => {
    const { pid } = spawnSync(process.execPath, ['-e', '']);
    writeFileSync(path, String(pid));
    const release = await acquireTestLock(path, 10);
    expect(readFileSync(path, 'utf8')).toBe(String(process.pid));
    release();
  });
});
