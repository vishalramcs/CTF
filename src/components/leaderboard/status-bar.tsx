import { AnimatedNumber } from '@/components/leaderboard/animated-number';
import { solvedCount } from '@/components/leaderboard/format';
import { STATUS } from '@/components/participant/phase-banner';
import type { LiveState } from '@/lib/realtime/public-state';

function Stat({ label, value, large }: { label: string; value: number; large?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className={`text-muted-foreground uppercase ${large ? 'text-base' : 'text-xs'}`}>
        {label}
      </dt>
      <dd className={`font-heading font-black tabular-nums ${large ? 'text-5xl' : 'text-2xl'}`}>
        <AnimatedNumber value={value} />
      </dd>
    </div>
  );
}

// Every figure is a sum over the public board, so it can't disagree with the rows below it.
export function StatusBar({ state, large }: { state: LiveState; large?: boolean }) {
  const rows = state.leaderboard;
  return (
    <div className="mission-panel flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-lg p-4">
      <div className="flex flex-col">
        <span className={`text-muted-foreground uppercase ${large ? 'text-base' : 'text-xs'}`}>
          Mission phase
        </span>
        <span
          className={`font-heading font-black text-ring uppercase ${large ? 'text-5xl' : 'text-2xl'}`}
        >
          {STATUS[state.status].name}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Teams" value={rows.length} large={large} />
        <Stat
          label="Challenges solved"
          value={rows.reduce((sum, row) => sum + solvedCount(row), 0)}
          large={large}
        />
        <Stat
          label="Points awarded"
          value={rows.reduce((sum, row) => sum + row.total, 0)}
          large={large}
        />
      </dl>
    </div>
  );
}
