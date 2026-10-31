'use client';

import { useRouter } from 'next/navigation';

import { AnswerForm } from '@/components/participant/answer-form';
import type { CoordinateBoard as BoardData } from '@/lib/coordinates/state';

const PAIRS = [
  { difficulty: 'easy', label: 'Easy' },
  { difficulty: 'medium', label: 'Medium' },
  { difficulty: 'difficult', label: 'Difficult' },
];

// docs/08 §3. Only fragments this team has earned arrive here, in question order (not the real
// sequence). Each difficulty's pair makes one coordinate; the Main Question reveals all three.
export function CoordinateBoard({ board }: { board: BoardData }) {
  const router = useRouter();
  const held = board.fragments.length;
  return (
    <div className="panel-notch flex flex-col gap-4 border border-border bg-card p-4">
      <p>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {held}/{board.slots}
        </span>{' '}
        <span className="text-muted-foreground">fragments held</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Every 2 fragments of a level make one coordinate. Or solve the Main Question to get all
        three at once.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {PAIRS.map(({ difficulty, label }, c) => {
          const pair = board.fragments.filter((f) => f.difficulty === difficulty);
          return (
            <section key={difficulty} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                Coordinate {c + 1} · {label} {pair.length === 2 && '✓'}
              </h3>
              <ol className="flex flex-col gap-2" aria-label={`Coordinate ${c + 1} fragments`}>
                {[0, 1].map((i) => {
                  const f = pair[i];
                  return (
                    <li key={i} className="flex min-h-20 flex-col gap-1 border border-border p-3">
                      {f ? (
                        <>
                          <span className="font-mono text-2xl font-semibold">{f.value}</span>
                          <span className="text-xs text-muted-foreground">from #{f.number}</span>
                          {f.orderClue && <span className="text-sm">{f.orderClue}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">🔒 Empty</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      {board.finalCoordinates && board.finalCoordinates.length > 0 && (
        <div className="flex flex-col gap-1 border-l-2 border-ring pl-3">
          <h3 className="font-heading text-lg font-bold uppercase">Final coordinates</h3>
          <ul>
            {board.finalCoordinates.map((c, i) => (
              <li key={i} className="font-mono text-2xl font-semibold">
                {c.label && <span className="mr-2 text-sm text-muted-foreground">{c.label}</span>}
                {c.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {board.found ? (
        <p className="text-success" role="status">
          ✓ Final location found.
        </p>
      ) : (
        <AnswerForm
          path="/api/coordinates/submit"
          label="Final location"
          submitLabel="Submit"
          onCorrect={() => router.refresh()}
        />
      )}
    </div>
  );
}
