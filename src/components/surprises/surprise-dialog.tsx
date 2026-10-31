'use client';

import { useEffect, useRef, useState } from 'react';

import { AnswerForm } from '@/components/participant/answer-form';
import { apiPost } from '@/lib/api-client';

type Found = { title: string; html: string; assetUrl: string | null; points: number };
type Phase = 'loading' | 'closed' | 'error' | 'video' | 'question' | 'done';

// Discovering is what reveals the task, so nothing is fetched until the team opens it.
export function SurpriseDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    let live = true;
    apiPost(`/api/surprises/${kind}/discover`, {})
      .then(async (res) => {
        if (!live || res.status === 401) return;
        const body = res.ok ? await res.json() : null;
        if (!body) return setPhase('error');
        if (body.result !== 'ok') return setPhase('closed');
        setFound(body);
        setPhase(body.assetUrl ? 'video' : 'question');
      })
      .catch(() => live && setPhase('error'));
    return () => {
      live = false;
    };
  }, [kind]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="surprise-title"
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto border border-border bg-card p-6 text-foreground backdrop:bg-black/90"
    >
      <div className="fade-up flex flex-col gap-4">
        <h2 id="surprise-title" className="font-heading text-3xl font-black uppercase">
          {found?.title ?? 'Incoming signal'}
        </h2>

        {phase === 'loading' && <p role="status">Tracing the signal…</p>}
        {phase === 'error' && <p role="status">Connection lost. Close this and try again.</p>}
        {phase === 'closed' && <p role="status">This one has closed.</p>}

        {phase === 'video' && found?.assetUrl && (
          <>
            {/* Never autoplays: the team presses play. */}
            <video
              src={found.assetUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full bg-black"
            />
            <button
              type="button"
              onClick={() => setPhase('question')}
              className="min-h-11 self-start rounded-sm border border-border px-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Continue to the question
            </button>
          </>
        )}

        {phase === 'question' && found && (
          <>
            {/* Sanitised on the server. */}
            <div dangerouslySetInnerHTML={{ __html: found.html }} />
            <AnswerForm
              path={`/api/surprises/${kind}/submit`}
              label="Your answer"
              submitLabel="Send"
              onCorrect={() => {
                setPhase('done');
                onDone();
              }}
            />
          </>
        )}

        {phase === 'done' && found && (
          <p role="status" className="text-success">
            ✓ Signal fragment recovered. +{found.points}
          </p>
        )}

        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="min-h-11 self-end rounded-sm border border-border px-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
