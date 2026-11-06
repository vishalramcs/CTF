'use client';

import { useRouter } from 'next/navigation';

import { AnswerForm } from '@/components/participant/answer-form';
import type { CoordinateBoard as BoardData } from '@/lib/coordinates/state';

type Slot = BoardData['locations'][number]['north'];

function FragmentRow({ side, slot }: { side: 'North' | 'South'; slot: Slot }) {
  return (
    <li className="flex min-h-16 flex-col gap-1 border border-border p-3">
      <span className="text-xs text-muted-foreground uppercase">
        {side} · {slot.id}
      </span>
      {slot.held ? (
        <>
          <span className="font-mono text-xl font-semibold break-all">{slot.value}</span>
          {slot.from !== null && (
            <span className="text-xs text-muted-foreground">from #{slot.from}</span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground">🔒 Locked</span>
      )}
    </li>
  );
}

// docs/11. Three locations, each rebuilt from a North and a South fragment. Only fragments this
// team has earned arrive here. A location shows its text once both halves are held, and the Main
// Question grants all six.
export function CoordinateBoard({ board }: { board: BoardData }) {
  const router = useRouter();
  const held = board.fragments.length;
  const done = board.locations.filter((l) => l.reconstructed).length;
  return (
    <div className="panel-notch flex flex-col gap-4 border border-border bg-card p-4">
      <p>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {held}/{board.slots}
        </span>{' '}
        <span className="text-muted-foreground">fragments held</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Each location needs its North and South fragment. Solve the questions that carry them, or
        solve the Main Question to get all six at once.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {board.locations.map((loc) => (
          <section key={loc.position} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Location {loc.position} · {loc.reconstructed ? 'Reconstructed ✓' : 'Incomplete'}
            </h3>
            <ol className="flex flex-col gap-2" aria-label={`Location ${loc.position} fragments`}>
              <FragmentRow side="North" slot={loc.north} />
              <FragmentRow side="South" slot={loc.south} />
            </ol>
            {loc.reconstructed && loc.text && (
              <div className="flex flex-col gap-1 border-l-2 border-ring pl-3">
                {loc.label && <span className="font-semibold uppercase">{loc.label}</span>}
                <span className="font-mono whitespace-pre-line">{loc.text}</span>
              </div>
            )}
          </section>
        ))}
      </div>

      {done === board.locations.length && (
        <p className="text-success" role="status">
          ✓ All three locations reconstructed.
        </p>
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
