'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export const inputClass =
  'mt-1 h-11 w-full rounded-md border border-input bg-secondary px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:text-sm';
export const textareaClass =
  'mt-1 w-full rounded-md border border-input bg-secondary p-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring';
export const actionClass = 'h-11 px-3 sm:h-8';

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

export function Modal({
  title,
  onClose,
  locked = false,
  children,
}: {
  title: string;
  onClose: () => void;
  // Holds something that can't be shown again, so Esc must not dismiss it by accident.
  locked?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={locked ? (event) => event.preventDefault() : undefined}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-md border border-border bg-card p-6 text-foreground backdrop:bg-black/80"
    >
      <h2 id={titleId} className="font-heading text-2xl font-black tracking-[0.02em] uppercase">
        {title}
      </h2>
      <div className="mt-3 space-y-4 text-sm">{children}</div>
    </dialog>
  );
}

// Design Brief §5: danger actions can ask for a typed word. onConfirm returns an error message.
export function ConfirmModal({
  title,
  word,
  label,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  word?: string;
  label: string;
  onConfirm: () => Promise<string | undefined>;
  onClose: () => void;
  children: ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const failure = await onConfirm();
    setPending(false);
    if (failure) setError(failure);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-muted-foreground">{children}</div>
        {word && (
          <label className="block font-medium">
            Type <span className="font-mono">{word}</span> to confirm
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className={actionClass} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className={actionClass}
            disabled={pending || (word !== undefined && typed !== word)}
          >
            {pending ? 'Working…' : label}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
