import { formatPoints } from '@/components/leaderboard/format';
import { requireTeam } from '@/lib/auth/guards';
import { getTeamHistory } from '@/lib/participant/history';
import { formatDateTimeIST } from '@/lib/participant/time';

const TYPE = { challenge: 'Challenge', location: 'Location', surprise: 'Surprise' } as const;

export default async function HistoryPage() {
  const { teamId } = await requireTeam();
  const { entries, wrongAttempts } = await getTeamHistory(teamId);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4">
      <h1 className="font-heading text-4xl font-black uppercase">History</h1>

      <section aria-labelledby="done" className="flex flex-col gap-3">
        <h2 id="done" className="font-heading text-2xl font-bold uppercase">
          Completed
        </h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet. Your first solve will show up here.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((e) => (
              <li
                key={`${e.type}-${e.title}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-border bg-card p-3"
              >
                <p>
                  <span className="mr-2 text-sm text-muted-foreground">{TYPE[e.type]}</span>
                  <span className="font-semibold">
                    {e.type === 'challenge' ? `#${e.number} ` : ''}
                    {e.title}
                  </span>
                  {e.type === 'challenge' && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      solve position {e.position}
                    </span>
                  )}
                </p>
                <p className="font-mono text-sm tabular-nums">
                  +{formatPoints(e.points)} · {formatDateTimeIST(e.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="wrong" className="flex flex-col gap-3">
        <h2 id="wrong" className="font-heading text-2xl font-bold uppercase">
          Wrong attempts
        </h2>
        {wrongAttempts.length === 0 ? (
          <p className="text-muted-foreground">None. Clean record.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {wrongAttempts.map((w) => (
              <li key={w.number} className="flex justify-between border border-border bg-card p-3">
                <span>
                  #{w.number} {w.title}
                </span>
                <span className="font-mono tabular-nums">{w.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
