'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { apiPost } from '@/lib/api-client';
import { parseCsv } from '@/lib/workspace/definitions';
import type { WorkspaceState } from '@/lib/workspace/state';

const H3 = 'font-heading text-xl font-bold uppercase';
const INPUT =
  'h-11 min-w-0 rounded-sm border border-input bg-secondary px-3 font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const BUTTON =
  'min-h-11 rounded-sm border border-border px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';

const fileUrl = (number: number, key: string) =>
  `/api/challenges/${number}/workspace/files/${encodeURIComponent(key)}`;

// Q4: pick a tile, then pick another to swap them. Turning a tile changes only this page's view.
function TileBoard({ number, files }: { number: number; files: WorkspaceState['files'] }) {
  const [order, setOrder] = useState(files.map((f) => f.key));
  const [turns, setTurns] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<number | null>(null);

  function pick(slot: number) {
    if (picked === null) return setPicked(slot);
    if (picked !== slot) {
      const next = [...order];
      [next[picked], next[slot]] = [next[slot], next[picked]];
      setOrder(next);
    }
    setPicked(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className={H3}>Reassemble</h3>
      <div className="grid w-full max-w-2xl grid-cols-3 border border-border">
        {order.map((key, slot) => (
          <button
            key={key}
            type="button"
            aria-label={`${key}, slot ${slot + 1}`}
            aria-pressed={picked === slot}
            onClick={() => pick(slot)}
            className="aspect-square overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:outline-2 aria-pressed:outline-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- behind a team login */}
            <img
              src={fileUrl(number, key)}
              alt=""
              className="size-full"
              style={{ transform: `rotate(${(turns[key] ?? 0) * 90}deg)` }}
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={picked === null}
        className={`${BUTTON} w-fit`}
        onClick={() => {
          if (picked === null) return;
          const key = order[picked];
          setTurns({ ...turns, [key]: (turns[key] ?? 0) + 1 });
        }}
      >
        Turn the picked tile 90°
      </button>
    </div>
  );
}

// Q6: simulated, answered by the server. No real message goes anywhere.
function Messages({ number }: { number: number }) {
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [log, setLog] = useState<{ to: string; text: string; reply: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiPost(`/api/challenges/${number}/message`, { to, text });
      if (!res.ok) {
        setError('The message did not send. Try again.');
        return;
      }
      const { reply } = (await res.json()) as { reply: string };
      setLog((entries) => [...entries, { to, text, reply }]);
      setText('');
    } catch {
      setError('Network problem. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className={H3}>Messages</h3>
      <p className="text-sm text-muted-foreground">Simulated. No real SMS is sent.</p>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {log.map((entry, i) => (
          <li key={i} className="border border-border p-2 font-mono text-sm">
            <p>
              You → {entry.to}: {entry.text}
            </p>
            <p className="text-ring">Reply: {entry.reply}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void send(e)} className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Number"
          placeholder="Number"
          inputMode="numeric"
          autoComplete="off"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={INPUT}
        />
        <input
          aria-label="Message"
          placeholder="Message"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${INPUT} flex-1`}
        />
        <button
          type="submit"
          disabled={busy || !to.trim() || !text.trim()}
          className={BUTTON}
        >
          Send
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

type Sighting = {
  id: string;
  time: string;
  x: number;
  y: number;
  marker: string;
  reporter: string;
  photo: string;
};

// Q8: drawn from the CSV and ticker files, so it holds no more than a team can download.
function Tracker({ number }: { number: number }) {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [ticker, setTicker] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    const read = async (key: string) => {
      const res = await fetch(fileUrl(number, key), { signal: abort.signal });
      if (!res.ok) throw new Error('file');
      return res.text();
    };
    Promise.all([read('sightings.csv'), read('tracker_ticker.txt')])
      .then(([csv, lines]) => {
        const rows = parseCsv(csv).slice(1);
        setSightings(
          rows.map(([id, time, x, y, marker, reporter, photo]) => ({
            id,
            time,
            x: Number(x),
            y: Number(y),
            marker,
            reporter,
            photo,
          })),
        );
        setTicker(lines.split(/\r?\n/).filter(Boolean));
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [number]);

  const active = sightings.find((s) => s.id === open);
  if (failed) return <p role="alert">The tracker could not load. Try again.</p>;
  return (
    <div className="flex flex-col gap-3">
      <h3 className={H3}>Spidey tracker</h3>
      <svg
        viewBox="0 0 100 60"
        role="group"
        aria-label="Sighting map"
        shapeRendering="crispEdges"
        className="w-full bg-[#0b2a6b]"
      >
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`v${i}`} x1={i * 10} x2={i * 10} y1={0} y2={60} stroke="#1b4aa8" strokeWidth={0.3} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1={0} x2={100} y1={i * 10} y2={i * 10} stroke="#1b4aa8" strokeWidth={0.3} />
        ))}
        <path
          d="M18 8h22v6h14v8h10v10h16v14H60v8H34v-8H20v-12h-8V16h6z"
          fill="#1d57c4"
          stroke="#7fb0ff"
          strokeWidth={0.4}
        />
        {sightings.map((s) => (
          <rect
            key={s.id}
            x={s.x - 1.5}
            y={(s.y * 60) / 100 - 1.5}
            width={3}
            height={3}
            tabIndex={0}
            role="button"
            aria-label={`Sighting ${s.id}, ${s.marker} marker`}
            fill={s.marker === 'green' ? '#35d07f' : '#e2232a'}
            stroke="#fff"
            strokeWidth={0.3}
            className="cursor-pointer"
            onClick={() => setOpen(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(s.id);
              }
            }}
          />
        ))}
      </svg>
      {active && (
        <dl
          role="status"
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 border border-border p-3 font-mono text-sm"
        >
          <dt className="text-muted-foreground">Sighting</dt>
          <dd>{active.id}</dd>
          <dt className="text-muted-foreground">Claimed time</dt>
          <dd>{active.time}</dd>
          <dt className="text-muted-foreground">Reported by</dt>
          <dd>{active.reporter}</dd>
          <dt className="text-muted-foreground">Photograph</dt>
          <dd>{active.photo}</dd>
        </dl>
      )}
      <ul aria-label="Activity ticker" className="bg-black p-3 font-mono text-sm text-[#35d07f]">
        {ticker.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function WorkspaceToolPanel({ number, state }: { number: number; state: WorkspaceState }) {
  if (state.tool === 'tiles') return <TileBoard number={number} files={state.files} />;
  if (state.tool === 'messages') return <Messages number={number} />;
  if (state.tool === 'tracker') return <Tracker number={number} />;
  return null;
}
