import { json, withTeam } from '@/lib/http';
import { listLocations } from '@/lib/locations/state';

export const runtime = 'nodejs';

export const GET = withTeam(async (_req, session) =>
  json({ locations: await listLocations(session.teamId) }),
);
