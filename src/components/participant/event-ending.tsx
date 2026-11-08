'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useLiveState } from '@/hooks/use-live-state';

const CLIP = '/ending/spider-man-will-return.mp4';
// If the clip stalls (network, codec), the ending still arrives.
const CLIP_LIMIT_MS = 15_000;
const FADE_MS = 700;

type Phase = 'idle' | 'fade' | 'clip' | 'final' | 'dismissed';

const read = (store: 'localStorage' | 'sessionStorage', key: string) => {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
};
const write = (store: 'localStorage' | 'sessionStorage', key: string) => {
  try {
    window[store].setItem(key, '1');
  } catch {
    // Private mode: the clip may play again after a refresh, nothing worse.
  }
};

// The event's last scene (mounted in the team layout). The server decides the event has ended (the
// admin END transition, which can happen once); every participant hears it from the status ping, or
// the 15 s poll, or on load. Then: the page fades to black, the organiser's clip plays once, with no
// player controls, and the closing card stays. The clip plays once per browser per END, so a refresh
// or a reconnect shows the closing card instead of playing it again; a team that opens the site later
// still sees it once.
export function EventEnding() {
  const { state } = useLiveState();
  const [phase, setPhase] = useState<Phase>('idle');
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const ended = state?.status === 'ended';
  const key = state ? `spidey-ending:${state.statusChangedAt}` : '';

  useEffect(() => {
    if (!ended || phase !== 'idle') return;
    if (read('sessionStorage', `${key}:closed`)) return setPhase('dismissed');
    if (read('localStorage', key)) return setPhase('final');
    write('localStorage', key);
    setPhase('fade');
  }, [ended, key, phase]);

  // A dialog in the top layer sits above everything else, even another open dialog.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const show = phase === 'fade' || phase === 'clip' || phase === 'final';
    if (show && !d.open) d.showModal();
    if (!show && d.open) d.close();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fade') return;
    const t = setTimeout(() => setPhase('clip'), FADE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'clip') return;
    const el = video.current;
    if (!el) return setPhase('final');
    el.currentTime = 0;
    // Sound first; a browser that refuses autoplay with sound gets the clip muted rather than nothing.
    el.muted = false;
    el.play().catch(() => {
      el.muted = true;
      return el.play().catch(() => setPhase('final'));
    });
    const limit = setTimeout(() => setPhase('final'), CLIP_LIMIT_MS);
    return () => clearTimeout(limit);
  }, [phase]);

  const close = () => {
    write('sessionStorage', `${key}:closed`);
    setPhase('dismissed');
  };

  return (
    <dialog
      ref={dialog}
      aria-label="The event has ended"
      onCancel={(e) => e.preventDefault()}
      data-phase={phase}
      className="event-ending fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-black p-0 text-foreground backdrop:bg-black"
    >
      {/* Mounted from the start (hidden) so the clip is already downloaded when the end comes. */}
      <video
        ref={video}
        src={CLIP}
        preload="auto"
        playsInline
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPause={(e) => {
          if (phase === 'clip' && !e.currentTarget.ended)
            void e.currentTarget.play().catch(() => {});
        }}
        onEnded={() => setPhase('final')}
        onError={() => phase === 'clip' && setPhase('final')}
        className="event-ending__clip"
        aria-hidden
      />
      {phase === 'final' && (
        <section
          role="status"
          className="event-ending__final flex h-full flex-col items-center justify-center gap-5 p-6 text-center"
        >
          <p className="font-heading text-sm font-bold tracking-[0.3em] text-muted-foreground uppercase">
            SPIDEY tracXer
          </p>
          <h2
            data-text="EVENT CONCLUDED"
            className="glitch-title font-heading text-5xl font-black tracking-[0.04em] uppercase sm:text-7xl"
          >
            EVENT CONCLUDED
          </h2>
          <p className="text-lg">Thank you for participating.</p>
          <p className="text-muted-foreground">The next challenge begins another day.</p>
          <p className="font-heading text-2xl font-black tracking-[0.12em] text-primary uppercase sm:text-3xl">
            Spider-Man will return.
          </p>
          <Link
            href="/leaderboard"
            onClick={close}
            className="mt-4 inline-flex min-h-11 items-center rounded-sm border border-border px-5 font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            See the final standings
          </Link>
        </section>
      )}
    </dialog>
  );
}
