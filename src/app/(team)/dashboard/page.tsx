import { requireTeam } from '@/lib/auth/guards';

// Placeholder: the login flow needs somewhere to land. M4 builds the real dashboard.
export default async function DashboardPage() {
  await requireTeam();

  return (
    <main className="p-4">
      <p className="text-muted-foreground">You&apos;re in. The dashboard arrives in M4.</p>
    </main>
  );
}
