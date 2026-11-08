import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FRAGMENT_SLOTS } from '@/lib/coordinates/fragments';
import { heldFragmentCount } from '@/lib/coordinates/submit';
import { db } from '@/lib/db/client';
import { ApiError, withTeam } from '@/lib/http';

export const runtime = 'nodejs';

const NAME = 'celestial_catalog.csv';

// docs/13. The celestial catalogue, only for a team holding all six fragments. The path is a
// literal so the build packages the file.
export const GET = withTeam(async (_req, session) => {
  if ((await heldFragmentCount(db, session.teamId)) < FRAGMENT_SLOTS) {
    throw new ApiError(403, 'locked', 'Hold all six fragments first.');
  }
  const content = await readFile(
    join(process.cwd(), 'src/lib/workspace/files/final-signal/celestial_catalog.csv'),
  );
  return new Response(new Uint8Array(content), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${NAME}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
