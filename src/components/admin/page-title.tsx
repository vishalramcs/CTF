export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-heading text-3xl leading-[1.1] font-black tracking-[0.02em] uppercase">
      {children}
    </h1>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xl leading-[1.1] font-bold tracking-[0.02em] uppercase">
      {children}
    </h2>
  );
}

export const panelClass = 'space-y-4 rounded-md border border-border bg-card p-4';
export const tableClass = 'w-full text-left text-sm';
export const thClass =
  'border-b border-border px-2 py-2 font-medium whitespace-nowrap text-muted-foreground';
export const tdClass = 'border-b border-border px-2 py-2 align-top';
