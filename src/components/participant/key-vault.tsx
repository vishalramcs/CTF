'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { AnswerForm } from '@/components/participant/answer-form';
import { Button } from '@/components/ui/button';
import { openMessage, type SealedMessage } from '@/lib/vault/crypto';
import type { Vault } from '@/lib/vault/state';

function Decoder({ keys, sealed }: { keys: Vault['keys']; sealed: SealedMessage }) {
  const id = useId();
  const [values, setValues] = useState(keys.map((k) => k.value ?? ''));
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function decode(event: FormEvent) {
    event.preventDefault();
    const text = await openMessage(
      values.map((v) => v.trim()),
      sealed,
    );
    setResult(text);
    setFailed(text === null);
  }

  return (
    <form
      onSubmit={(e) => void decode(e)}
      className="flex flex-col gap-2 border-l-2 border-ring pl-3"
    >
      <h3 className="font-heading text-lg font-bold uppercase">Final decoder</h3>
      {keys.map((k, i) => (
        <div key={k.slot} className="flex flex-col gap-1">
          <label htmlFor={`${id}-${k.slot}`} className="text-sm font-semibold">
            KEY 0{k.slot}
          </label>
          <input
            id={`${id}-${k.slot}`}
            value={values[i]}
            onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 rounded-sm border border-input bg-secondary px-3 font-mono focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
      ))}
      <Button type="submit" className="h-11 w-fit px-4">
        Decrypt
      </Button>
      <div role="status">
        {failed && <p>Decryption failed.</p>}
        {result && <p className="font-mono text-lg font-semibold whitespace-pre-wrap">{result}</p>}
      </div>
    </form>
  );
}

// docs/09 §2. Only keys this team has earned arrive here.
export function KeyVault({ vault }: { vault: Vault }) {
  const router = useRouter();
  return (
    <div className="dash-card flex flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        Any 2 flags in a tier earn its key. The Main Question earns the fourth. All four open the
        final transmission.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {vault.keys.map((k) => (
          <li
            key={k.slot}
            className="flex min-h-20 flex-col gap-1 rounded-lg border border-border bg-secondary/40 p-3"
          >
            <span className="text-sm font-semibold">
              KEY 0{k.slot} · {k.label}
            </span>
            {k.value ? (
              <span className="font-mono text-lg font-semibold break-all">{k.value}</span>
            ) : (
              <span className="text-muted-foreground">
                🔒 {Math.min(k.solved, k.need)}/{k.need}
              </span>
            )}
          </li>
        ))}
      </ul>

      {vault.sealed && <Decoder keys={vault.keys} sealed={vault.sealed} />}

      {vault.found ? (
        <p className="text-success" role="status">
          ✓ Final flag confirmed.
        </p>
      ) : (
        <AnswerForm
          path="/api/coordinates/submit"
          label="Final flag"
          submitLabel="Submit"
          onCorrect={() => router.refresh()}
        />
      )}
    </div>
  );
}
