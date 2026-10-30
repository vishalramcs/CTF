import { LogoutButton } from '@/components/shared/logout-button';
import { SessionGuard } from '@/components/shared/session-guard';
import { requireTeam } from '@/lib/auth/guards';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const { teamName } = await requireTeam();

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border p-4">
        <p className="font-heading text-xl font-black tracking-[0.02em] uppercase">{teamName}</p>
        <LogoutButton loginPath="/login" />
      </header>
      {children}
      <SessionGuard loginPath="/login" />
    </>
  );
}
