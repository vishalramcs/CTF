import { actor } from '@/lib/admin/http';
import { triggerRun } from '@/lib/flashy/admin';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = withAdmin(async (req, session) => {
  const out = await triggerRun(actor(req, session));
  if (out.result === 'live') {
    throw new ApiError(409, 'already_live', 'The event is already live.');
  }
  if (out.result === 'not_ready') {
    throw new ApiError(
      409,
      'not_ready',
      'Set the video, the four options and the correct one before triggering.',
    );
  }
  return json({ ok: true });
});
