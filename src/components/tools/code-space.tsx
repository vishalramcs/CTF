'use client';

import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { OPS, type OpId, bytesToHex, bytesToText, runStep, textToBytes } from '@/lib/tools/codec';

type Step = { key: number; op: OpId; param: string };

const FIELD =
  'rounded-sm border border-input bg-secondary px-3 font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

let nextKey = 1;
const makeStep = (op: OpId): Step => ({
  key: nextKey++,
  op,
  param: OPS.find((o) => o.id === op)?.param?.initial ?? '',
});

// Every step runs on the output of the one before; an error stops the chain at that step.
export function CodeSpace() {
  const inputId = useId();
  const [input, setInput] = useState('');
  const [steps, setSteps] = useState<Step[]>([makeStep('from_base64')]);
  const [asHex, setAsHex] = useState(false);
  const [adding, setAdding] = useState<OpId>('from_hex');

  const results = useMemo(() => {
    let bytes: Uint8Array = textToBytes(input);
    let failed = false;
    return steps.map((s) => {
      if (failed) return { error: null, bytes: null };
      try {
        bytes = runStep(bytes, s.op, s.param);
        return { error: null, bytes };
      } catch (e) {
        failed = true;
        return { error: e instanceof Error ? e.message : 'This step failed.', bytes: null };
      }
    });
  }, [input, steps]);

  const update = (key: number, patch: Partial<Step>) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, by: number) =>
    setSteps((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item);
      return next;
    });

  const last = results.at(-1)?.bytes;
  const show = (b: Uint8Array) => (asHex ? bytesToHex(b) : bytesToText(b));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold">
          Input
        </label>
        <textarea
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="Paste the encoded text here"
          className={`${FIELD} min-h-24 py-2`}
        />
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const def = OPS.find((o) => o.id === s.op)!;
          const r = results[i];
          return (
            <li key={s.key} className="mission-panel flex flex-col gap-2 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">Step {i + 1}</span>
                <select
                  aria-label={`Step ${i + 1} operation`}
                  value={s.op}
                  onChange={(e) => {
                    const op = e.target.value as OpId;
                    update(s.key, {
                      op,
                      param: OPS.find((o) => o.id === op)?.param?.initial ?? '',
                    });
                  }}
                  className={`${FIELD} h-9 font-sans`}
                >
                  {OPS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {def.param && (
                  <input
                    aria-label={def.param.label}
                    placeholder={def.param.label}
                    value={s.param}
                    onChange={(e) => update(s.key, { param: e.target.value })}
                    className={`${FIELD} h-9 min-w-0 flex-1`}
                  />
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move step up"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === steps.length - 1}
                    aria-label="Move step down"
                  >
                    ↓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSteps((l) => l.filter((x) => x.key !== s.key))}
                    aria-label={`Remove step ${i + 1}`}
                  >
                    ✕
                  </Button>
                </div>
              </div>
              {r.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {r.error}
                </p>
              ) : r.bytes ? (
                <pre className="max-h-40 overflow-auto font-mono text-sm break-all whitespace-pre-wrap">
                  {show(r.bytes) || '(empty)'}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">Fix the step above first.</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Operation to add"
          value={adding}
          onChange={(e) => setAdding(e.target.value as OpId)}
          className={`${FIELD} h-9 font-sans`}
        >
          {OPS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Button onClick={() => setSteps((l) => [...l, makeStep(adding)])}>Add step</Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={asHex} onChange={(e) => setAsHex(e.target.checked)} />
          Show bytes as hex
        </label>
        {last && (
          <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(show(last))}>
            Copy result
          </Button>
        )}
      </div>
    </div>
  );
}
