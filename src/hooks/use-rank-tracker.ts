'use client';

import { useEffect, useRef, useState } from 'react';

import { comparable, diffBoards, toRankEvents, type RankEvent } from '@/lib/leaderboard/movement';
import type { LiveState } from '@/lib/realtime/public-state';

export type RankChange = { previousRank: number; positions: number; points: number; v: number };

const KEEP_EVENTS = 30;
const SHOW_TOASTS = 3;
const TOAST_MS = 6_000;
const TAKEOVER_MS = 4_000;

// Turns successive server responses into what moved. Starts empty on page load: the public API has
// no history, so there is nothing to compare the first response with.
export function useRankTracker(state: LiveState | null) {
  const last = useRef<LiveState | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [changes, setChanges] = useState<ReadonlyMap<string, RankChange>>(new Map());
  const [events, setEvents] = useState<RankEvent[]>([]);
  const [toasts, setToasts] = useState<RankEvent[]>([]);
  const [newLeader, setNewLeader] = useState<string | null>(null);

  useEffect(() => {
    if (!state || last.current === state) return;
    const prev = last.current;
    last.current = state;
    if (!prev || !comparable(prev, state)) return;

    const moves = diffBoards(prev.leaderboard, state.leaderboard);
    if (moves.length === 0) return;

    setChanges((current) => {
      const next = new Map(current);
      for (const { teamName, previousRank, positions, points } of moves) {
        next.set(teamName, { previousRank, positions, points, v: state.v });
      }
      return next;
    });

    const fresh = toRankEvents(prev, state, moves);
    if (fresh.length === 0) return;
    setEvents((current) => {
      const seen = new Set(current.map((event) => event.id));
      return [...fresh.filter((event) => !seen.has(event.id)), ...current].slice(0, KEEP_EVENTS);
    });
    setToasts((current) => [...fresh, ...current].slice(0, SHOW_TOASTS));
    timers.current.push(
      setTimeout(() => {
        const gone = new Set(fresh.map((event) => event.id));
        setToasts((current) => current.filter((event) => !gone.has(event.id)));
      }, TOAST_MS),
    );

    const leader = fresh.find((event) => event.kind === 'new_leader');
    if (leader) {
      setNewLeader(leader.teamName);
      timers.current.push(setTimeout(() => setNewLeader(null), TAKEOVER_MS));
    }
  }, [state]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { changes, events, toasts, newLeader };
}
