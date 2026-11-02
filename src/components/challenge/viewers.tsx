'use client';

import { useEffect, useMemo, useState } from 'react';

import { parseExif } from '@/lib/workspace/exif';
import { asciiOf, parsePcapng } from '@/lib/workspace/pcap';

const INPUT =
  'h-11 min-w-0 flex-1 rounded-sm border border-input bg-secondary px-3 font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const BUTTON =
  'min-h-11 rounded-sm border border-border px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const BYTES_PER_LINE = 16;
const LINES_PER_PAGE = 32;

function useBytes(url: string): ArrayBuffer | 'failed' | null {
  const [bytes, setBytes] = useState<ArrayBuffer | 'failed' | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(url, { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error('file');
        return res.arrayBuffer();
      })
      .then(setBytes)
      .catch(() => {
        if (!abort.signal.aborted) setBytes('failed');
      });
    return () => abort.abort();
  }, [url]);
  return bytes;
}

function Loading({ state }: { state: 'failed' | null }) {
  if (state === 'failed') return <p role="alert">This file could not be opened. Try again.</p>;
  return <p role="status">Opening…</p>;
}

export function HexViewer({ url }: { url: string }) {
  const bytes = useBytes(url);
  const [page, setPage] = useState(0);
  if (bytes === null || bytes === 'failed') return <Loading state={bytes} />;

  const data = new Uint8Array(bytes);
  const pageBytes = BYTES_PER_LINE * LINES_PER_PAGE;
  const lastPage = Math.floor((data.length - 1) / pageBytes);
  const start = page * pageBytes;
  const rows: { offset: string; hex: string; text: string }[] = [];
  for (let at = start; at < Math.min(start + pageBytes, data.length); at += BYTES_PER_LINE) {
    const slice = data.subarray(at, at + BYTES_PER_LINE);
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const text = Array.from(slice, (b) =>
      b >= 32 && b < 127 ? String.fromCharCode(b) : '.',
    ).join('');
    rows.push({ offset: at.toString(16).padStart(8, '0'), hex: hex.padEnd(47), text });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON} onClick={() => setPage(0)}>
          Start
        </button>
        <button type="button" className={BUTTON} onClick={() => setPage(Math.max(page - 1, 0))}>
          Back
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setPage(Math.min(page + 1, lastPage))}
        >
          Next
        </button>
        <button type="button" className={BUTTON} onClick={() => setPage(lastPage)}>
          End
        </button>
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {lastPage + 1} · {data.length} bytes
        </span>
      </div>
      {/* One line on a wide screen. On a phone the parts wrap, so the hex is never cut off. */}
      <div className="flex flex-col font-mono text-xs">
        {rows.map((row) => (
          <div
            key={row.offset}
            className="flex flex-wrap gap-x-4 border-b border-border py-1 whitespace-pre-wrap"
          >
            <span className="text-muted-foreground">{row.offset}</span>
            <span>{row.hex}</span>
            <span>{row.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExifViewer({ url }: { url: string }) {
  const bytes = useBytes(url);
  if (bytes === null || bytes === 'failed') return <Loading state={bytes} />;
  const fields = Object.entries(parseExif(bytes));
  if (fields.length === 0) return <p className="text-muted-foreground">No metadata found.</p>;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-sm">
      {fields.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-muted-foreground">{name}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const PACKETS_SHOWN = 200;

export function PacketViewer({ url }: { url: string }) {
  const bytes = useBytes(url);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const packets = useMemo(
    () => (bytes && bytes !== 'failed' ? parsePcapng(bytes) : []),
    [bytes],
  );
  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return packets;
    return packets.filter((p) =>
      `${p.no} ${p.time} ${p.src} ${p.dst} ${p.srcPort} ${p.dstPort} ${asciiOf(p.payload)}`
        .toLowerCase()
        .includes(term),
    );
  }, [packets, filter]);
  if (bytes === null || bytes === 'failed') return <Loading state={bytes} />;

  const open = packets.find((p) => p.no === selected);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Filter by address, time, port or text
        <input value={filter} onChange={(e) => setFilter(e.target.value)} className={INPUT} />
      </label>
      <p className="text-sm text-muted-foreground" role="status">
        {shown.length} of {packets.length} packets
        {shown.length > PACKETS_SHOWN && `, first ${PACKETS_SHOWN} listed. Filter to narrow it.`}
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-border">
              {['No.', 'Time (UTC)', 'Source', 'Destination', 'Proto', 'Bytes', 'Info'].map((h) => (
                <th key={h} scope="col" className="p-2 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, PACKETS_SHOWN).map((p) => (
              <tr key={p.no} className="border-b border-border">
                <td className="p-1">
                  <button
                    type="button"
                    aria-current={p.no === selected ? 'true' : undefined}
                    onClick={() => setSelected(p.no)}
                    className="min-h-8 min-w-8 rounded-sm underline underline-offset-2 aria-[current=true]:bg-secondary"
                  >
                    {p.no}
                  </button>
                </td>
                <td className="p-2 whitespace-nowrap">{p.time}</td>
                <td className="p-2 whitespace-nowrap">
                  {p.src}:{p.srcPort}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {p.dst}:{p.dstPort}
                </td>
                <td className="p-2">{p.proto}</td>
                <td className="p-2">{p.payload.length}</td>
                <td className="max-w-64 truncate p-2">
                  {asciiOf(p.payload).split(/\r?\n/)[0].slice(0, 60)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold">Packet {open.no} payload</h4>
          <pre className="overflow-x-auto border border-border p-2 font-mono text-xs whitespace-pre-wrap">
            {open.payload.length > 0 ? asciiOf(open.payload) : '(no payload)'}
          </pre>
        </div>
      )}
    </div>
  );
}

type SqlResult = { columns: string[]; values: unknown[][] };
type SqlDatabase = { exec: (query: string) => SqlResult[] };
type SqlJs = { Database: new (data: Uint8Array) => SqlDatabase };
type InitSqlJs = (config: { locateFile: () => string }) => Promise<SqlJs>;

// sql.js from public/ as a plain script: webpack can't bundle it, and most pages never need it.
function loadSqlJs(): Promise<SqlJs> {
  const page = window as unknown as { initSqlJs?: InitSqlJs };
  const start = () => page.initSqlJs!({ locateFile: () => '/sql-wasm.wasm' });
  if (page.initSqlJs) return start();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/sql-wasm.js';
    script.onload = () => start().then(resolve, reject);
    script.onerror = () => reject(new Error('script'));
    document.head.append(script);
  });
}

export function SqliteViewer({ url }: { url: string }) {
  const bytes = useBytes(url);
  const [database, setDatabase] = useState<SqlDatabase | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SqlResult[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bytes || bytes === 'failed') return;
    let current = true;
    void loadSqlJs()
      .then((SQL) => {
        if (!current) return;
        const db = new SQL.Database(new Uint8Array(bytes));
        const [rows] = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
        const names = rows ? rows.values.map((row) => String(row[0])) : [];
        setDatabase(db);
        setTables(names);
        const first = names[0] ? `SELECT * FROM ${names[0]};` : '';
        setQuery(first);
        if (first) setResults(db.exec(first));
      })
      .catch(() => setError('The database viewer could not start. Try again.'));
    return () => {
      current = false;
    };
  }, [bytes]);

  function run(text: string) {
    if (!database) return;
    setError('');
    try {
      setResults(database.exec(text));
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : 'That query did not run.');
    }
  }

  if (bytes === null || bytes === 'failed') return <Loading state={bytes} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Tables: {tables.join(', ') || '…'}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <input
          aria-label="SQL query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className={INPUT}
        />
        <button type="submit" className={BUTTON}>
          Run
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {results.map((result, i) => (
        <div key={i} className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-border">
                {result.columns.map((column) => (
                  <th key={column} scope="col" className="p-2 whitespace-nowrap">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.values.map((row, r) => (
                <tr key={r} className="border-b border-border">
                  {row.map((cell, c) => (
                    <td key={c} className="p-2">
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
