import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ApiError, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';
import { findWorkspaceFile } from '@/lib/workspace/definitions';
import { isFileDeleted } from '@/lib/workspace/state';

export const runtime = 'nodejs';

// The folder must be a literal here: the build traces this call to package the files, and a
// variable folder makes it package the entire project.
const READERS: Record<string, (key: string) => Promise<Buffer>> = {
  'mj-archive': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/mj-archive', key)),
};

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

  const content = await READERS[workspace](file.key);
  return new Response(new Uint8Array(content), {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.key)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
