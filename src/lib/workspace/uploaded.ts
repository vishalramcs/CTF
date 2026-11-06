import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import {
  WORKSPACES,
  type Workspace,
  type WorkspaceFile,
  type WorkspaceFileKind,
} from '@/lib/workspace/definitions';

// Workspaces an admin uploads live in a private Supabase Storage bucket, one folder each. Only the
// server reads it (service key); teams get files through the signed-in workspace route as before.
const BUCKET = 'workspaces';

export const WORKSPACE_NAME = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

const TEXT = 'text/plain; charset=utf-8';
const TYPES: Record<string, { kind: WorkspaceFileKind; contentType: string }> = {
  pdf: { kind: 'pdf', contentType: 'application/pdf' },
  csv: { kind: 'csv', contentType: TEXT },
  json: { kind: 'json', contentType: TEXT },
  txt: { kind: 'text', contentType: TEXT },
  log: { kind: 'text', contentType: TEXT },
  md: { kind: 'text', contentType: TEXT },
  png: { kind: 'image', contentType: 'image/png' },
  gif: { kind: 'image', contentType: 'image/gif' },
  webp: { kind: 'image', contentType: 'image/webp' },
  jpg: { kind: 'exif', contentType: 'image/jpeg' },
  jpeg: { kind: 'exif', contentType: 'image/jpeg' },
  db: { kind: 'sqlite', contentType: 'application/octet-stream' },
  sqlite: { kind: 'sqlite', contentType: 'application/octet-stream' },
  pcap: { kind: 'pcap', contentType: 'application/octet-stream' },
  pcapng: { kind: 'pcap', contentType: 'application/octet-stream' },
};
export const UPLOAD_EXTENSIONS = Object.keys(TYPES);

export function fileType(key: string) {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return FILE_NAME.test(key) && Object.hasOwn(TYPES, ext) ? TYPES[ext] : undefined;
}

let client: ReturnType<typeof createClient> | undefined;
function storage() {
  client ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { error } = await storage().createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
  bucketReady = true;
}

export async function listUploadedWorkspaces(): Promise<string[]> {
  await ensureBucket();
  const { data, error } = await storage().from(BUCKET).list('', { limit: 1000 });
  if (error) throw error;
  // Folders come back with a null id.
  return data.filter((o) => o.id === null && WORKSPACE_NAME.test(o.name)).map((o) => o.name);
}

export async function listUploadedFiles(workspace: string): Promise<WorkspaceFile[]> {
  if (!WORKSPACE_NAME.test(workspace)) return [];
  await ensureBucket();
  const { data, error } = await storage()
    .from(BUCKET)
    .list(workspace, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  return data.flatMap((o) => {
    const type = o.id === null ? undefined : fileType(o.name);
    return type ? [{ key: o.name, ...type }] : [];
  });
}

// Built-in workspaces win; anything else is looked up in the bucket.
export async function resolveWorkspace(name: string): Promise<Workspace | undefined> {
  if (Object.hasOwn(WORKSPACES, name)) return WORKSPACES[name];
  const files = await listUploadedFiles(name);
  return files.length > 0 ? { title: name, intro: '', files } : undefined;
}

export async function findFile(workspace: string, key: string) {
  return (await resolveWorkspace(workspace))?.files.find((file) => file.key === key);
}

export async function downloadUploadedFile(workspace: string, key: string): Promise<Buffer> {
  const { data, error } = await storage().from(BUCKET).download(`${workspace}/${key}`);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

// A one-off URL the admin's browser PUTs the file to, so big files skip the function body limit.
export async function signUpload(workspace: string, key: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await storage()
    .from(BUCKET)
    .createSignedUploadUrl(`${workspace}/${key}`, { upsert: true });
  if (error) throw error;
  return data.signedUrl;
}

export async function removeUploadedFile(workspace: string, key: string) {
  const { error } = await storage()
    .from(BUCKET)
    .remove([`${workspace}/${key}`]);
  if (error) throw error;
}
