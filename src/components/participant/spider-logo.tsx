// Original mark: a round-bodied spider over web rings. Not any official logo.
export function SpiderLogo({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none">
      <circle cx="24" cy="24" r="22" stroke="#2d6bff" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="14" stroke="#2d6bff" strokeOpacity="0.3" />
      <g stroke="#e8ecf6" strokeWidth="1.6" strokeLinecap="round">
        <path d="M24 24 10 12M24 24 6 22M24 24 8 36M24 24 14 44" />
        <path d="M24 24 38 12M24 24 42 22M24 24 40 36M24 24 34 44" />
      </g>
      <ellipse cx="24" cy="27" rx="6" ry="8" fill="#e2232a" />
      <circle cx="24" cy="17" r="4" fill="#ff4a50" />
    </svg>
  );
}
