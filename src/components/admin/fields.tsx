import type { ReactNode } from 'react';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block font-medium">
      {label}
      {hint && <span className="block text-sm font-normal text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

// State is always written out, never colour alone (Design Brief §7).
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn';
  children: ReactNode;
}) {
  return (
    <p
      role="note"
      className={`rounded-md border p-3 text-sm ${tone === 'warn' ? 'border-destructive' : 'border-border'}`}
    >
      <strong>{tone === 'warn' ? 'Warning: ' : 'Note: '}</strong>
      {children}
    </p>
  );
}
