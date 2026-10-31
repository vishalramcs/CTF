// TRD §6.3: one Realtime socket per browser. The tab holding this lock is the leader; the lock
// passes to another tab when the leader closes.
export function electLeader(onLead: () => () => void): () => void {
  if (!('locks' in navigator)) return onLead(); // shortcut: no Web Locks, every tab leads

  const abort = new AbortController();
  let release: (() => void) | undefined;
  let stop: (() => void) | undefined;
  navigator.locks
    .request(
      'spidey-rt-leader',
      { signal: abort.signal },
      () =>
        new Promise<void>((resolve) => {
          stop = onLead();
          release = resolve;
        }),
    )
    .catch(() => {}); // aborted while waiting: nothing to clean up

  return () => {
    abort.abort();
    stop?.();
    release?.();
  };
}
