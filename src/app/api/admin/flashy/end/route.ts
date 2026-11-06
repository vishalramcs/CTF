import { actor } from '@/lib/admin/http';
import { endRun } from '@/lib/flashy/admin';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = withAdmin(async (req, session) => {
  const out = await endRun(actor(req, session));
  if (out.result === 'none') throw new ApiError(409, 'not_live', 'No event is live.');
  return json({ ok: true });
});
