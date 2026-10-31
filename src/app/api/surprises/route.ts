import { json, withTeam } from '@/lib/http';
import { listSurprises } from '@/lib/surprises/state';

export const runtime = 'nodejs';

export const GET = withTeam(async (_req, session) =>
  json({ surprises: await listSurprises(session.teamId) }),
);
