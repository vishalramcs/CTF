import { LogoutButton } from '@/components/shared/logout-button';
import { SessionGuard } from '@/components/shared/session-guard';
import { requireAdmin } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border p-4">
        <p className="font-heading text-xl font-black tracking-[0.02em] uppercase">Admin</p>
        <LogoutButton loginPath="/admin/login" />
      </header>
      {children}
      <SessionGuard loginPath="/admin/login" />
    </>
  );
}
