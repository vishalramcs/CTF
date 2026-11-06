import { PageTitle } from '@/components/admin/page-title';
import { WorkspacesPanel } from '@/components/admin/workspaces-panel';
import { requireAdmin } from '@/lib/auth/guards';
import { WORKSPACES } from '@/lib/workspace/definitions';
import {
  listUploadedFiles,
  listUploadedWorkspaces,
  UPLOAD_EXTENSIONS,
} from '@/lib/workspace/uploaded';

export default async function WorkspacesPage() {
  await requireAdmin();
  const names = await listUploadedWorkspaces();
  const workspaces = await Promise.all(
    names.map(async (name) => ({
      name,
      files: (await listUploadedFiles(name)).map(({ key, kind }) => ({ key, kind })),
    })),
  );

  return (
    <>
      <PageTitle>Workspaces</PageTitle>
      <WorkspacesPanel
        workspaces={workspaces}
        builtIn={Object.keys(WORKSPACES)}
        extensions={UPLOAD_EXTENSIONS}
      />
    </>
  );
}
