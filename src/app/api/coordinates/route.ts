import { getCoordinateBoard } from '@/lib/coordinates/state';
import { json, withTeam } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withTeam(async (_req, session) =>
  json(await getCoordinateBoard(session.teamId)),
);
