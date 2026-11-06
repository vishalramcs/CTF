import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ApiError, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';
import { isFileDeleted } from '@/lib/workspace/state';
import { downloadUploadedFile, findFile } from '@/lib/workspace/uploaded';

export const runtime = 'nodejs';

// The folder must be a literal here: the build traces this call to package the files, and a
// variable folder makes it package the entire project.
const READERS: Record<string, (key: string) => Promise<Buffer>> = {
  'mj-archive': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/mj-archive', key)),
  'q2-oscorp': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q2-oscorp', key)),
  'q3-bugle': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q3-bugle', key)),
  'q4-evidence': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q4-evidence', key)),
  'q6-contact': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q6-contact', key)),
  'q7-connors': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q7-connors', key)),
  'q8-sightings': (key) =>
    readFile(join(process.cwd(), 'src/lib/workspace/files/q8-sightings', key)),
  'q9-capture': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q9-capture', key)),
  'q10-cameras': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q10-cameras', key)),
  'q11-specimen': (key) =>
    readFile(join(process.cwd(), 'src/lib/workspace/files/q11-specimen', key)),
  'q12-archive': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q12-archive', key)),
  'q13-tracker': (key) => readFile(join(process.cwd(), 'src/lib/workspace/files/q13-tracker', key)),
};

// Files are outside public/: a team must be signed in and the question must be open to it. The path
// comes from the definition found by exact key match, never from the request.
export const GET = withTeam<{ number: string; file: string }>(async (_req, session, { params }) => {
  const { number, file: key } = await params;
  const view = await getChallengeView(session.teamId, number);
  const workspace = view?.access === 'open' ? view.workspace : null;
  const file = workspace ? await findFile(workspace, key) : undefined;
  if (!workspace || !file) throw new ApiError(404, 'not_found', 'No such file.');
  if (await isFileDeleted(session.teamId, workspace, file.key)) {
    throw new ApiError(410, 'deleted', 'This file was deleted.');
  }

  const content = Object.hasOwn(READERS, workspace)
    ? await READERS[workspace](file.key)
    : await downloadUploadedFile(workspace, file.key);
  return new Response(new Uint8Array(content), {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.key)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
