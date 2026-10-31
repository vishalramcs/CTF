'use client';

import { createClient } from '@supabase/supabase-js';

import { electLeader } from '@/lib/realtime/leader';

export type LiveEvent = 'board' | 'status';

type Relay =
  { type: 'event'; event: LiveEvent } | { type: 'conn'; up: boolean } | { type: 'hello' };

// Browser side of TRD §6. The leader tab owns the socket and relays to the other tabs over
// BroadcastChannel. Only Broadcast is used: app tables are never queried from the browser.
export function subscribeLive(
  channel: string,
  onEvent: (event: LiveEvent) => void,
  onConn: (up: boolean) => void,
): () => void {
  const bc = new BroadcastChannel('spidey');
  let leading = false;
  let up = false;

  bc.onmessage = ({ data }: MessageEvent<Relay>) => {
    if (data.type === 'event') onEvent(data.event);
    else if (data.type === 'conn') onConn(data.up);
    else if (leading) bc.postMessage({ type: 'conn', up } satisfies Relay);
  };

  const stopLeading = electLeader(() => {
    leading = true;
    const setUp = (value: boolean) => {
      up = value;
      onConn(value);
      bc.postMessage({ type: 'conn', up: value } satisfies Relay);
    };
    const ping = (event: LiveEvent) => {
      onEvent(event);
      bc.postMessage({ type: 'event', event } satisfies Relay);
    };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const socket = supabase
      .channel(channel, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'board' }, () => ping('board'))
      .on('broadcast', { event: 'status' }, () => ping('status'))
      .subscribe((status) => setUp(status === 'SUBSCRIBED'));

    return () => {
      leading = false;
      void supabase.removeChannel(socket);
      void supabase.realtime.disconnect();
    };
  });

  bc.postMessage({ type: 'hello' } satisfies Relay);
  return () => {
    stopLeading();
    bc.close();
  };
}
