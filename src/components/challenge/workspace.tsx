'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiPost } from '@/lib/api-client';
import { parseCsv } from '@/lib/workspace/definitions';
import type { WorkspaceState } from '@/lib/workspace/state';

type File = WorkspaceState['files'][number];

const fileUrl = (number: number, key: string) =>
  `/api/challenges/${number}/workspace/files/${encodeURIComponent(key)}`;

function TextPreview({ file, url }: { file: File; url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    setText(null);
    setFailed(false);
    fetch(url, { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error('file');
        return res.text();
      })
      .then(setText)
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [url]);

  if (failed) return <p role="alert">This file could not be opened. Try again.</p>;
  if (text === null) return <p role="status">Opening…</p>;

  if (file.kind === 'csv') {
    const [head, ...rows] = parseCsv(text);
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left font-mono text-sm">
          <thead>
            <tr className="border-b border-border">
              {head.map((cell) => (
                <th key={cell} scope="col" className="p-2 whitespace-nowrap uppercase">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border">
                {row.map((cell, j) => (
                  <td key={j} className="p-2 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const shown = file.kind === 'json' ? JSON.stringify(JSON.parse(text), null, 2) : text;
  return <pre className="overflow-x-auto font-mono text-sm whitespace-pre-wrap">{shown}</pre>;
}

function Preview({ file, number }: { file: File; number: number }) {
  const url = fileUrl(number, file.key);
  if (file.kind === 'pdf') {
    return (
      <div className="flex flex-col gap-2">
        <iframe title={file.key} src={url} className="h-[70vh] w-full bg-white" />
        {/* Many phone browsers won't show a PDF inside a page. */}
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center text-sm text-ring underline underline-offset-4"
        >
          Open the newspaper in a new tab
        </a>
      </div>
    );
  }
  if (file.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element -- behind a team login, not optimisable
    return <img src={url} alt={`Recovered photograph ${file.key}`} className="h-auto w-full" />;
  }
  return <TextPreview file={file} url={url} />;
}

export function Workspace({
  number,
  initial,
  solved,
}: {
  number: number;
  initial: WorkspaceState;
  solved: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const file = state.files.find((f) => f.key === selected);

  function select(key: string) {
    setSelected(key);
    setConfirming(false);
    setMessage('');
  }

  async function remove() {
    if (!file || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await apiPost(`${fileUrl(number, file.key)}/delete`);
      if (res.ok) {
        setState((await res.json()) as WorkspaceState);
        setSelected(null);
        setMessage(`${file.key} was deleted.`);
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setMessage(body?.error?.message ?? 'That did not work. Try again.');
      }
    } catch {
      setMessage('Network problem. Try again.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section aria-labelledby="workspace" className="flex flex-col gap-4">
      <div>
        <h2 id="workspace" className="font-heading text-2xl font-bold uppercase">
          The MJ Archive
        </h2>
        <p className="text-muted-foreground">
          Investigate MJ’s recovered files, uncover the truth behind article NY-204, and discover
          what she left hidden in the archive.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="border border-border bg-card p-3">
          <dt className="text-sm text-muted-foreground">Q{number} status</dt>
          <dd className={`font-semibold ${solved ? 'text-success' : ''}`}>
            {solved ? '✓ Completed' : 'Not completed'}
          </dd>
        </div>
        {state.unlock && (
          <div className="border border-border bg-card p-3">
            <dt className="text-sm text-muted-foreground">Q{state.unlock.number} status</dt>
            <dd className={`font-semibold ${state.unlock.unlocked ? 'text-success' : ''}`}>
              {state.unlock.unlocked ? '✓ Unlocked' : '🔒 Locked'}
            </dd>
          </div>
        )}
      </dl>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 w-fit rounded-sm bg-primary px-4 font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Open Workspace
        </button>
      ) : (
        <div className="grid gap-4 border border-border bg-card p-3 md:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Recovered files">
            <ul className="flex flex-col gap-1">
              {state.files.map((f) => (
                <li key={f.key}>
                  <button
                    type="button"
                    aria-current={f.key === selected ? 'true' : undefined}
                    onClick={() => select(f.key)}
                    className="min-h-11 w-full rounded-sm px-2 text-left font-mono text-sm break-all hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=true]:bg-secondary"
                  >
                    {f.key}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-3">
            {file ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-semibold break-all">{file.key}</h3>
                  {confirming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">Delete this file?</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={remove}
                        className="min-h-11 rounded-sm bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="min-h-11 rounded-sm border border-border px-3 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="min-h-11 rounded-sm border border-border px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <Preview key={file.key} file={file} number={number} />
              </>
            ) : (
              <p className="text-muted-foreground">Select a file to open it.</p>
            )}
            <p role="status" className="text-sm">
              {message}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
