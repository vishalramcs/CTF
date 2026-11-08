import { SpiderLogo } from '@/components/participant/spider-logo';

// Original web art (Design Brief §2): thin lines radiating from one corner.
function WebCorner({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      fill="none"
      stroke="var(--border)"
      className={`pointer-events-none absolute size-48 sm:size-72 ${className}`}
    >
      <path d="M0 0 200 30M0 0 165 105M0 0 105 165M0 0 30 200" />
      <path d="M60 9Q50 32 49 31T31 49Q32 50 9 60" />
      <path d="M120 18Q100 62 99 62T62 99Q62 100 18 120" />
      <path d="M180 27Q150 94 148 93T93 148Q94 150 27 180" />
    </svg>
  );
}

// A frosted glass card over the site's moving background (team and admin login).
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="glass relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <WebCorner className="top-0 left-0" />
      <WebCorner className="right-0 bottom-0 rotate-180" />
      <div className="auth-glass relative w-full max-w-sm p-6">
        <p className="flex items-center gap-2 font-heading text-sm font-bold tracking-[0.02em] text-muted-foreground">
          <SpiderLogo />
          SPIDEY tracXer
        </p>
        <h1
          data-text={title}
          className="glitch-title mt-1 font-heading text-3xl leading-[1.1] font-black tracking-[0.02em] uppercase"
        >
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
