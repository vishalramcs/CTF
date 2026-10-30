import { requireAdmin } from '@/lib/auth/guards';

// Placeholder: the login flow needs somewhere to land. M3 builds the real overview.
export default async function AdminPage() {
  await requireAdmin();

  return (
    <main className="p-4">
      <p className="text-muted-foreground">Admin panel arrives in M3.</p>
    </main>
  );
}
