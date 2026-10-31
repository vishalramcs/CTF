// R8: broadcast payloads and failure handling. No network: fetch is injected.
import { describe, expect, it, vi } from 'vitest';

import { boardPayload, channelName, sendBroadcast, statusPayload } from '@/lib/realtime/broadcast';
import { env } from '@/lib/env';

describe('broadcast payloads', () => {
  it('carry only the allowed keys', () => {
    expect(Object.keys(boardPayload())).toEqual([]);
    expect(statusPayload('running')).toEqual({ status: 'running' });
  });

  it('uses the public channel from the prefix', () => {
    expect(channelName()).toBe(`${env.REALTIME_CHANNEL_PREFIX}:public`);
  });
});

describe('sendBroadcast', () => {
  it('posts one public message and never puts the service key in the body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    expect(await sendBroadcast('board', boardPayload(), fetchMock as never)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messages: [{ topic: channelName(), event: 'board', payload: {}, private: false }],
    });
    expect(init.body as string).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('does not throw when the request fails, and logs no secret', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await sendBroadcast('status', statusPayload('paused'), failing as never)).toBe(false);

    const rejected = vi.fn(async () => new Response(null, { status: 500 }));
    expect(await sendBroadcast('board', boardPayload(), rejected as never)).toBe(false);

    expect(log).toHaveBeenCalledWith('broadcast failed', {
      event: 'status',
      message: 'network down',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
    log.mockRestore();
  });
});
