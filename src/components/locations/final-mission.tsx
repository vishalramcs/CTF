'use client';

import { useEffect, useRef } from 'react';

// Static cards that fade in (the .fade-up animation is off under reduced motion). No flashing.
export function FinalMissionOverlay({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="final-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl border border-border bg-card p-6 text-foreground backdrop:bg-black/90"
    >
      <div className="fade-up flex flex-col gap-4 text-center">
        <p className="font-mono text-sm tracking-widest text-ring uppercase">Final mission</p>
        <h2 id="final-title" className="font-heading text-4xl font-black uppercase">
          The Multiverse is safe
        </h2>
        <p>You decoded the final location. The city will not forget this team.</p>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="mx-auto min-h-11 rounded-sm bg-primary px-6 font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Back to the city
        </button>
      </div>
    </dialog>
  );
}
