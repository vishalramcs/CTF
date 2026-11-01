import Image from 'next/image';

// Organiser-supplied logo, the exception recorded in CLAUDE.md rule 11.
export function SpiderLogo({ className = 'size-11' }: { className?: string }) {
  return (
    <Image
      src="/event-logo.png"
      alt=""
      width={335}
      height={335}
      className={`rounded-full ${className}`}
    />
  );
}
