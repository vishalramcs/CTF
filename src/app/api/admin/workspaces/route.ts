import { z } from 'zod';

import { actor } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';
import { WORKSPACES } from '@/lib/workspace/definitions';
import {
  fileType,
  listUploadedFiles,
  removeUploadedFile,
  signUpload,
  WORKSPACE_NAME,
} from '@/lib/workspace/uploaded';

export const runtime = 'nodejs';

const target = z.object({
  workspace: z
    .string()
    .regex(WORKSPACE_NAME, 'Use 2-40 lowercase letters, digits or dashes.')
    .refine((w) => !Object.hasOwn(WORKSPACES, w), 'That name belongs to a built-in workspace.'),
  file: z.string().refine((f) => fileType(f) !== undefined, 'Unsupported file name or type.'),
});

// Returns a one-off upload URL; the browser sends the file straight to Storage.
export const POST = withAdmin(async (req, session) => {
  const { workspace, file } = await parseBody(req, target);
  const uploadUrl = await signUpload(workspace, file);
  await audit(db, {
    ...actor(req, session),
    action: 'workspace.upload',
    entityType: 'workspace',
    entityId: workspace,
    details: { file },
  });
  return json({ uploadUrl, contentType: fileType(file)!.contentType });
});

export const DELETE = withAdmin(async (req, session) => {
  const { workspace, file } = await parseBody(req, target);
  if (!(await listUploadedFiles(workspace)).some((f) => f.key === file)) {
    throw new ApiError(404, 'not_found', 'No such file.');
  }
  await removeUploadedFile(workspace, file);
  await audit(db, {
    ...actor(req, session),
    action: 'workspace.delete_file',
    entityType: 'workspace',
    entityId: workspace,
    details: { file },
  });
  return json({ ok: true });
});
