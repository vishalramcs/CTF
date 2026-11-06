'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { usePoll } from '@/components/participant/use-poll';
import { apiPost } from '@/lib/api-client';
import {
  FLASHY_MESSAGES,
  PLAYBACK_LIMIT,
  type FlashyOutcome,
  type FlashyTeamState,
} from '@/lib/flashy/shared';

const POLL_MS = 5_000;
const FOCUS = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type Live = Extract<FlashyTeamState, { active: true }>;

// Mounted in the team layout. The server owns every fact here (live or not, plays left, whether the
// question may show, the result): this only asks, shows, and posts the team's clicks. Polling every
// 5 s is also how a refresh or a reconnect gets the right state back.
export function FlashyLayer() {
  const [state, setState] = useState<FlashyTeamState>({ active: false });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/flashy', { cache: 'no-store' });
      if (res.ok) setState((await res.json()) as FlashyTeamState);
    } catch {
      // Offline: keep what is on screen, the next poll will catch up.
    }
  }, []);
  usePoll(refresh, POLL_MS);

  if (!state.active) return null;
  return <Overlay key={state.runId} state={state} refresh={refresh} />;
}

function Overlay({ state, refresh }: { state: Live; refresh: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const wantPlay = useRef(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Shown once, from the answer response. After "Continue" the server's `done` keeps it closed.
  const [shown, setShown] = useState<FlashyOutcome | null>(null);

  const visible = shown !== null || state.phase !== 'done';

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (visible && !d.open) d.showModal();
    if (!visible && d.open) d.close();
  }, [visible]);

  // Start the video once the element has rendered with its source, never before a click.
  useEffect(() => {
    const el = player.current;
    if (!wantPlay.current || !el || !videoUrl) return;
    wantPlay.current = false;
    el.currentTime = 0;
    void el.play().catch(() => {}); // blocked: the controls are there for the team to press
  });

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const res = await apiPost(path, body);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error?.message ?? 'Signal interference, try again');
      return res.ok ? data : null;
    } catch {
      setError('Connection lost. Check your network and try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function play() {
    const data = await post('/api/flashy/playback');
    if (!data) return void refresh();
    setVideoUrl(data.videoUrl);
    wantPlay.current = true;
    await refresh();
  }

  async function answer() {
    const data = await post('/api/flashy/answer', { optionId: selected });
    if (data) setShown(data.result);
    await refresh();
  }

  async function skip() {
    const data = await post('/api/flashy/skip');
    setConfirmSkip(false);
    if (data) await refresh();
  }

  const left = state.playbacksLeft;
  const message = shown ? FLASHY_MESSAGES[shown] : null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="flashy-title"
      onCancel={(e) => e.preventDefault()}
      className="flashy-stage fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-y-auto border-0 bg-[#02030a] p-0 text-foreground backdrop:bg-black"
    >
      <div className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-sm font-bold tracking-[0.2em] text-muted-foreground uppercase">
              SPIDEY tracXer
            </p>
            <h2
              id="flashy-title"
              data-text="FLASHY SPIDER-MAN"
              className="flashy-glitch font-heading text-3xl font-black tracking-[0.04em] uppercase sm:text-5xl"
            >
              FLASHY SPIDER-MAN
            </h2>
          </div>
          {!message && (
            <button
              type="button"
              onClick={() => setConfirmSkip(true)}
              disabled={busy}
              className={`min-h-11 shrink-0 rounded-sm border border-[#2d6bff] px-4 font-heading text-sm font-bold tracking-wider uppercase hover:bg-[#2d6bff]/15 ${FOCUS}`}
            >
              Skip event
            </button>
          )}
        </header>

        {confirmSkip && (
          <div
            role="alertdialog"
            aria-label="Skip the event"
            className="border border-primary bg-card p-4"
          >
            <p className="font-semibold">Skip this event?</p>
            <p className="text-sm text-muted-foreground">
              You will get no bonus points and cannot come back to it.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={skip}
                disabled={busy}
                className={`min-h-11 rounded-sm bg-primary px-4 font-semibold text-primary-foreground ${FOCUS}`}
              >
                Skip event
              </button>
              <button
                type="button"
                onClick={() => setConfirmSkip(false)}
                className={`min-h-11 rounded-sm border border-border px-4 ${FOCUS}`}
              >
                Keep playing
              </button>
            </div>
          </div>
        )}

        {message && (
          <section role="status" className="fade-up flex flex-col items-start gap-4 py-8">
            <p
              className={`font-heading text-4xl font-black uppercase sm:text-6xl ${
                shown === 'correct' ? 'text-success' : 'text-primary'
              }`}
            >
              {message.title}
            </p>
            <p className="text-lg">{message.body}</p>
            <button
              type="button"
              onClick={() => setShown(null)}
              className={`min-h-11 rounded-sm bg-primary px-6 font-semibold text-primary-foreground ${FOCUS}`}
            >
              Back to the mission
            </button>
          </section>
        )}

        {!message && state.phase !== 'done' && (
          <>
            <p className="font-mono text-sm text-muted-foreground" aria-live="polite">
              Plays left: {left} of {PLAYBACK_LIMIT}
            </p>

            {state.phase === 'watch' && (
              <section className="flex flex-col gap-4">
                <div className="relative aspect-video w-full overflow-hidden border border-[#2d6bff]/60 bg-black">
                  {videoUrl && (
                    <video
                      ref={player}
                      src={videoUrl}
                      controls
                      controlsList="nodownload"
                      playsInline
                      preload="auto"
                      onEnded={() => void refresh()}
                      className="size-full"
                    />
                  )}
                  {!videoUrl && (
                    <div className="flashy-signal absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center">
                      {left > 0 ? (
                        <button
                          type="button"
                          onClick={play}
                          disabled={busy}
                          className={`min-h-14 rounded-sm bg-primary px-8 font-heading text-xl font-black tracking-wider text-primary-foreground uppercase ${FOCUS}`}
                        >
                          ▶ Play video
                        </button>
                      ) : (
                        <p>Your plays are used. The question unlocks when the signal ends.</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Watch closely. You will be asked what you saw.
                      </p>
                    </div>
                  )}
                </div>
                {videoUrl && left > 0 && (
                  <button
                    type="button"
                    onClick={play}
                    disabled={busy}
                    className={`min-h-11 self-start rounded-sm border border-border px-4 ${FOCUS}`}
                  >
                    Play again ({left} left)
                  </button>
                )}
              </section>
            )}

            {state.phase === 'quiz' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void answer();
                }}
                className="fade-up flex flex-col gap-4"
              >
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-4 font-heading text-2xl font-bold sm:text-3xl">
                    {state.question}
                  </legend>
                  {state.options.map((o) => (
                    <label
                      key={o.id}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 border p-3 font-mono text-xl ${
                        selected === o.id ? 'border-primary bg-primary/15' : 'border-border bg-card'
                      }`}
                    >
                      <input
                        type="radio"
                        name="flashy-option"
                        value={o.id}
                        checked={selected === o.id}
                        onChange={() => setSelected(o.id)}
                        className="size-5 accent-[#e2232a]"
                      />
                      {o.label}
                    </label>
                  ))}
                </fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={busy || !selected}
                    className={`min-h-11 rounded-sm bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50 ${FOCUS}`}
                  >
                    Submit answer
                  </button>
                  {left > 0 && (
                    <button
                      type="button"
                      onClick={play}
                      disabled={busy}
                      className={`min-h-11 rounded-sm border border-border px-4 ${FOCUS}`}
                    >
                      Watch again ({left} left)
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
