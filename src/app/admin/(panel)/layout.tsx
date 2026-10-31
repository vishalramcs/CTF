import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutButton } from '@/components/shared/logout-button';
import { SessionGuard } from '@/components/shared/session-guard';
import { requireAdmin } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <p className="font-heading text-xl font-black tracking-[0.02em] uppercase">Admin</p>
          <AdminNav isSuper={session.adminLevel === 'super_admin'} />
        </div>
        <LogoutButton loginPath="/admin/login" />
      </header>
      <main className="mx-auto max-w-[1200px] space-y-6 p-4">{children}</main>
      <SessionGuard loginPath="/admin/login" />
    </>
  );
}
