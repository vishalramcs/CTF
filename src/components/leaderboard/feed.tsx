import { formatPoints, formatTimeIST } from '@/components/leaderboard/format';
import type { FeedItem } from '@/lib/realtime/public-state';

export function Feed({ items, large }: { items: FeedItem[]; large?: boolean }) {
  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-2">
      <h2
        id="feed-title"
        className={`font-heading font-bold uppercase ${large ? 'text-3xl' : 'text-xl'}`}
      >
        Latest solves
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No solves to show yet.</p>
      ) : (
        <ul className={`flex flex-col gap-1 ${large ? 'text-xl' : 'text-sm'}`}>
          {items.map((item) => (
            <li
              key={`${item.solvedAt}-${item.teamName}-${item.challengeNumber}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-1"
            >
              <span>
                <strong>{item.teamName}</strong> solved #{item.challengeNumber}{' '}
                {item.challengeTitle}
              </span>
              <span className="font-mono text-muted-foreground tabular-nums">
                +{formatPoints(item.points)} · {formatTimeIST(item.solvedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
