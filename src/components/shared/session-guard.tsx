'use client';

import { useEffect, useRef, useState } from 'react';

import { fetchSession, SESSION_ENDED_EVENT } from '@/lib/api-client';
import {
  isSessionEndReason,
  SESSION_ENDED_MESSAGES,
  type SessionEndReason,
} from '@/lib/auth/shared';
import { buttonVariants } from '@/components/ui/button';

// App Flow §5: the modal for a session that was evicted, revoked or expired.
export function SessionGuard({ loginPath }: { loginPath: string }) {
  const [reason, setReason] = useState<SessionEndReason>();
  const [loginHref, setLoginHref] = useState(loginPath);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onEnded = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!isSessionEndReason(detail)) return;
      const next = window.location.pathname + window.location.search;
      setLoginHref(`${loginPath}?next=${encodeURIComponent(next)}`);
      setReason(detail);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchSession().catch(() => {});
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loginPath]);

  useEffect(() => {
    if (reason && !dialog.current?.open) dialog.current?.showModal();
  }, [reason]);

  if (!reason) return null;

  return (
    <dialog
      ref={dialog}
      // Esc closes overlays (Design Brief §7), but this session is gone, so never reveal the stale
      // page behind. Chrome ignores preventDefault on cancel without a prior user gesture.
      onClose={() => window.location.assign(loginHref)}
      aria-labelledby="session-ended-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-card p-6 text-foreground backdrop:bg-black/80"
    >
      <h2
        id="session-ended-title"
        className="font-heading text-2xl font-black tracking-[0.02em] uppercase"
      >
        Session ended
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{SESSION_ENDED_MESSAGES[reason]}</p>
      <a href={loginHref} className={buttonVariants({ className: 'mt-6 h-11 w-full text-base' })}>
        Log in again
      </a>
    </dialog>
  );
}
