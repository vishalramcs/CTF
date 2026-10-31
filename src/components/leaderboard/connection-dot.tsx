import type { Connection } from '@/hooks/use-live-state';

const LABEL: Record<Connection, { text: string; dot: string }> = {
  live: { text: 'Live', dot: 'bg-success' },
  polling: { text: 'Updating every 15 s', dot: 'bg-warn' },
  offline: { text: 'Offline, retrying', dot: 'bg-destructive' },
};

// The text carries the state; the dot colour is a second cue.
export function ConnectionDot({ connection }: { connection: Connection }) {
  const { text, dot } = LABEL[connection];
  return (
    <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
      {text}
    </p>
  );
}
