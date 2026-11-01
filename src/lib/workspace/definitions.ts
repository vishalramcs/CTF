// A workspace is a simulated folder. Its files are this fixed list: a request can only ever name a
// key from it, so no client value reaches a filesystem path, and "delete" only records progress.

export type WorkspaceFileKind = 'pdf' | 'csv' | 'json' | 'text' | 'image';

export type WorkspaceFile = {
  key: string;
  kind: WorkspaceFileKind;
  contentType: string;
  deletable?: boolean;
  // Deleting this file unlocks the question with this number, for the team that deleted it.
  unlocksQuestion?: number;
};

export type Workspace = { files: WorkspaceFile[] };

const TEXT = 'text/plain; charset=utf-8';

export const WORKSPACES: Record<string, Workspace> = {
  'mj-archive': {
    files: [
      { key: 'MJ_Newspaper.pdf', kind: 'pdf', contentType: 'application/pdf' },
      { key: 'archive_access.csv', kind: 'csv', contentType: TEXT },
      { key: 'revision_history.json', kind: 'json', contentType: TEXT },
      { key: 'authentication.log', kind: 'text', contentType: TEXT },
      { key: 'editor_notes.txt', kind: 'text', contentType: TEXT },
      { key: 'photo_01.jpg', kind: 'image', contentType: 'image/jpeg' },
      { key: 'photo_02.jpg', kind: 'image', contentType: 'image/jpeg' },
      { key: 'old_draft.tmp', kind: 'text', contentType: TEXT, deletable: true },
      { key: 'mj_cache.tmp', kind: 'text', contentType: TEXT, deletable: true, unlocksQuestion: 9 },
    ],
  },
};

export function findWorkspaceFile(workspace: string, key: string): WorkspaceFile | undefined {
  return Object.hasOwn(WORKSPACES, workspace)
    ? WORKSPACES[workspace].files.find((file) => file.key === key)
    : undefined;
}

// Splits simple evidence CSVs: no quoted fields, since these files are ours.
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split(',').map((cell) => cell.trim()));
}
