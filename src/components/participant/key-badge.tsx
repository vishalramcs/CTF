import { formatDateTimeIST } from '@/lib/participant/time';

type Level = 'easy' | 'medium' | 'difficult' | 'main_difficult';

const COLOUR: Record<Level, string> = {
  easy: '#2bd47d',
  medium: '#2d6bff',
  difficult: '#ff8a1f',
  main_difficult: '#e2232a',
};

// Four original shapes: diamond, hexagon, shard, ringed star.
function Shape({ level, fill }: { level: Level; fill: string }) {
  switch (level) {
    case 'easy':
      return <path d="M24 4 40 24 24 44 8 24Z" fill={fill} />;
    case 'medium':
      return <path d="M24 4 41 14v20L24 44 7 34V14Z" fill={fill} />;
    case 'difficult':
      return <path d="M24 3 44 40H4Z M24 15 14 34h20Z" fill={fill} fillRule="evenodd" />;
    case 'main_difficult':
      return (
        <>
          <circle cx="24" cy="24" r="20" fill="none" stroke={fill} strokeWidth="3" />
          <path d="M24 9l4 11 11 1-9 7 3 11-9-6-9 6 3-11-9-7 11-1Z" fill={fill} />
        </>
      );
  }
}

// Locked or collected is said in words, not only by colour.
export function KeyBadge({
  level,
  name,
  acquiredAt,
}: {
  level: Level;
  name: string;
  acquiredAt: string | null;
}) {
  const fill = acquiredAt ? COLOUR[level] : '#3a4560';
  return (
    <li className="flex items-center gap-3 border border-border bg-card p-3">
      <svg viewBox="0 0 48 48" className="size-12 shrink-0" aria-hidden>
        <Shape level={level} fill={fill} />
      </svg>
      <div>
        <p className="font-semibold">{name}</p>
        <p className={`text-sm ${acquiredAt ? 'text-success' : 'text-muted-foreground'}`}>
          {acquiredAt ? `✓ Collected ${formatDateTimeIST(acquiredAt)}` : '🔒 Locked'}
        </p>
      </div>
    </li>
  );
}
