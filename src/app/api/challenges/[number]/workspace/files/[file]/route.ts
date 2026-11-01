import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ApiError, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';
import { findWorkspaceFile, WORKSPACES } from '@/lib/workspace/definitions';
import { isFileDeleted } from '@/lib/workspace/state';

export const runtime = 'nodejs';

// Files are outside public/: a team must be signed in and the question must be open to it. The path
// comes from the definition found by exact key match, never from the request.
export const GET = withTeam<{ number: string; file: string }>(async (_req, session, { params }) => {
  const { number, file: key } = await params;
  const view = await getChallengeView(session.teamId, number);
  const workspace = view?.access === 'open' ? view.workspace : null;
  const file = workspace ? findWorkspaceFile(workspace, key) : undefined;
  if (!workspace || !file) throw new ApiError(404, 'not_found', 'No such file.');
  if (await isFileDeleted(session.teamId, workspace, file.key)) {
    throw new ApiError(410, 'deleted', 'This file was deleted.');
  }

  const content = await readFile(join(process.cwd(), WORKSPACES[workspace].dir, file.key));
  return new Response(content, {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.key)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
