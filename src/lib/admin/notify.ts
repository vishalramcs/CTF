import { db } from '@/lib/db/client';
import { eventState } from '@/lib/db/schema';
import { notifyStatus as broadcastStatus } from '@/lib/realtime/broadcast';
import type { EventStatus } from '@/lib/scoring/points';

export { notifyBoard } from '@/lib/realtime/broadcast';

// Call after the transaction commits. The change is already saved, so a failed ping must not turn
// the request into an error: clients still catch up on their 15 s poll.
export async function notifyStatus(): Promise<void> {
  try {
    const [state] = await db.select({ status: eventState.status }).from(eventState);
    await broadcastStatus(state.status as EventStatus);
  } catch (e) {
    console.error('broadcast failed', {
      event: 'status',
      message: e instanceof Error ? e.message : 'error',
    });
  }
}
