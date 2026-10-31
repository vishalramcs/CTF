'use client';

import { useEffect, useRef, useState } from 'react';

import { subscribeLive } from '@/lib/realtime/client';
import type { FeedItem, LiveState, PublicState } from '@/lib/realtime/public-state';

export type Connection = 'live' | 'polling' | 'offline';

const POLL_MS = 15_000;
const TRAILING_MS = 1_500;

async function load(signal: AbortSignal): Promise<LiveState> {
  // One after the other, as everywhere: the CDN caches both.
  const state = await fetch('/api/public/state', { signal });
  if (!state.ok) throw new Error('state');
  const feed = await fetch('/api/public/feed', { signal });
  if (!feed.ok) throw new Error('feed');
  return {
    ...((await state.json()) as PublicState),
    feed: ((await feed.json()) as { feed: FeedItem[] }).feed,
  };
}

// The public board, kept fresh: Broadcast pings when the socket is up, 15 s polling when not.
export function useLiveState(): { state: LiveState | null; connection: Connection } {
  const [state, setState] = useState<LiveState | null>(null);
  const [socketUp, setSocketUp] = useState(false);
  const [fetchOk, setFetchOk] = useState(true);
  const socketRef = useRef(false);

  useEffect(() => {
    const abort = new AbortController();
    let timers: ReturnType<typeof setTimeout>[] = [];
    let unsubscribe: (() => void) | undefined;

    const refetch = () => {
      load(abort.signal)
        .then((next) => {
          setState(next);
          setFetchOk(true);
          // First load tells us the channel to join.
          if (!unsubscribe) {
            unsubscribe = subscribeLive(
              next.channel,
              (event) => {
                refetch();
                if (event === 'board') timers.push(setTimeout(refetch, TRAILING_MS));
              },
              (up) => {
                const reconnected = up && !socketRef.current;
                socketRef.current = up;
                setSocketUp(up);
                if (reconnected) refetch();
              },
            );
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) setFetchOk(false);
        });
    };
    refetch();

    const poll = setInterval(() => {
      if (!socketRef.current && document.visibilityState === 'visible') refetch();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refetch();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refetch);

    return () => {
      abort.abort();
      clearInterval(poll);
      timers.forEach(clearTimeout);
      timers = [];
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refetch);
      unsubscribe?.();
    };
  }, []);

  const connection: Connection = socketUp ? 'live' : fetchOk ? 'polling' : 'offline';
  return { state, connection };
}
