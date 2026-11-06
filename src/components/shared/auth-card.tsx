import { SpiderLogo } from '@/components/participant/spider-logo';
import { HangingSpider } from '@/components/shared/hanging-spider';

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

export function AuthCard({
  title,
  subtitle,
  children,
  spider = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  // Team login only: a compact card on the left and the hanging spider on the right (wide screens).
  spider?: boolean;
}) {
  const card = (
    <div
      className={`relative w-full bg-card [clip-path:polygon(0_0,calc(100%-16px)_0,100%_16px,100%_100%,16px_100%,0_calc(100%-16px))] ${
        spider ? 'max-w-[22rem] p-5' : 'max-w-sm p-6'
      }`}
    >
      <p className="flex items-center gap-2 font-heading text-sm font-bold tracking-[0.02em] text-muted-foreground">
        <SpiderLogo />
        SPIDEY tracXer
      </p>
      <h1
        data-text={title}
        className={`mt-1 font-heading text-3xl leading-[1.1] font-black tracking-[0.02em] uppercase ${
          spider ? 'glitch-title' : ''
        }`}
      >
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      <div className={spider ? 'mt-4' : 'mt-6'}>{children}</div>
    </div>
  );

  if (!spider) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
        <WebCorner className="top-0 left-0" />
        <WebCorner className="right-0 bottom-0 rotate-180" />
        {card}
      </main>
    );
  }
  // Below lg the spider is not rendered, so it can never sit over the form.
  return (
    <main className="relative flex min-h-dvh overflow-hidden">
      <div className="relative flex flex-1 items-center justify-center p-4">
        <WebCorner className="top-0 left-0" />
        {card}
      </div>
      <aside className="relative hidden flex-1 border-l border-border lg:block">
        <HangingSpider />
      </aside>
    </main>
  );
}
