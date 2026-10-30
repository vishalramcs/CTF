import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/shared/auth-card';
import { LoginForm } from '@/components/shared/login-form';
import { currentSession } from '@/lib/auth/guards';
import { isSessionEndReason, SESSION_ENDED_MESSAGES } from '@/lib/auth/shared';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  const result = await currentSession();
  if (result.ok && result.session.role === 'admin') redirect('/admin');

  return (
    <AuthCard title="Admin login" subtitle="Organisers only.">
      <LoginForm
        endpoint="/api/auth/admin-login"
        next="/admin"
        notice={isSessionEndReason(reason) ? SESSION_ENDED_MESSAGES[reason] : undefined}
      />
    </AuthCard>
  );
}
