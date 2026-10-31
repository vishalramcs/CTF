import { z } from 'zod';

import { listAttempts } from '@/lib/admin/monitor';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const query = z.object({ team: z.uuid().optional() });

export const GET = withAdmin(async (req) => {
  const team = req.nextUrl.searchParams.get('team') || undefined;
  const parsed = query.safeParse({ team });
  if (!parsed.success) throw new ApiError(400, 'bad_request', 'Check the filter.');
  return json({ attempts: await listAttempts(parsed.data.team, 100) });
});
