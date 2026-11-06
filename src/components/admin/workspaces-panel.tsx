'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Field } from '@/components/admin/fields';
import {
  panelClass,
  SectionTitle,
  tableClass,
  tdClass,
  thClass,
} from '@/components/admin/page-title';
import { actionClass, ErrorText, inputClass } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { send } from '@/lib/admin/client';

type Folder = { name: string; files: { key: string; kind: string }[] };

export function WorkspacesPanel({
  workspaces,
  builtIn,
  extensions,
}: {
  workspaces: Folder[];
  builtIn: string[];
  extensions: string[];
}) {
  const router = useRouter();
  const { run, error } = useAction();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const workspace = String(f.get('workspace') ?? '').trim();
    const files = f.getAll('files').filter((v): v is File => v instanceof File && v.size > 0);
    if (files.length === 0) return setUploadError('Choose at least one file.');
    setBusy(true);
    setUploadError(undefined);
    try {
      for (const [i, file] of files.entries()) {
        setStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const signed = await send<{ uploadUrl: string; contentType: string }>(
          'POST',
          '/api/admin/workspaces',
          { workspace, file: file.name },
        );
        if (!signed.ok) throw new Error(`${file.name}: ${signed.message}`);
        const res = await fetch(signed.data.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': signed.data.contentType, 'x-upsert': 'true' },
          body: file,
        });
        if (!res.ok) throw new Error(`${file.name}: upload failed (${res.status}).`);
      }
      form.reset();
      setStatus(`Uploaded ${files.length} file(s) to ${workspace}.`);
      router.refresh();
    } catch (e) {
      setStatus(undefined);
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={panelClass}>
        <SectionTitle>Upload files</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          A workspace is a folder of files teams see on a question. Type a new folder name, or an
          existing one to add files. A file with the same name is replaced. Then pick the folder in
          Challenges → Edit → Workspace. Allowed: {extensions.join(', ')}.
        </p>
        <form onSubmit={upload} className="space-y-4">
          <Field label="Workspace folder" hint="2-40 lowercase letters, digits or dashes.">
            <input
              name="workspace"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,39}"
              list="workspace-names"
              className={inputClass}
            />
            <datalist id="workspace-names">
              {workspaces.map((w) => (
                <option key={w.name} value={w.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Files">
            <input
              name="files"
              type="file"
              multiple
              required
              accept={extensions.map((e) => `.${e}`).join(',')}
              className={inputClass}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
          {status && <p role="status">{status}</p>}
          <ErrorText>{uploadError}</ErrorText>
        </form>
      </section>

      <section className={panelClass}>
        <SectionTitle>Uploaded workspaces</SectionTitle>
        <ErrorText>{error}</ErrorText>
        {workspaces.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {workspaces.map((w) => (
          <div key={w.name} className="mb-6">
            <h3 className="mb-2 font-mono font-bold">{w.name}</h3>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>File</th>
                  <th className={thClass}>Shown as</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {w.files.map((file) => (
                  <tr key={file.key}>
                    <td className={`${tdClass} font-mono`}>{file.key}</td>
                    <td className={tdClass}>{file.kind}</td>
                    <td className={tdClass}>
                      <button
                        type="button"
                        className={actionClass}
                        onClick={() =>
                          run('DELETE', '/api/admin/workspaces', {
                            workspace: w.name,
                            file: file.key,
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          Built-in (in code, not editable here): {builtIn.join(', ')}.
        </p>
      </section>
    </div>
  );
}
