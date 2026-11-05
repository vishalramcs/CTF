import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/shared/auth-card';
import { LoginForm } from '@/components/shared/login-form';
import { currentSession } from '@/lib/auth/guards';
import { isSessionEndReason, safeNext, SESSION_ENDED_MESSAGES } from '@/lib/auth/shared';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  const target = safeNext(next, '/dashboard');

  // Logging in again from a live session would take a slot and evict the team's other device.
  const result = await currentSession();
  if (result.ok && result.session.role === 'team') redirect(target);

  return (
    <AuthCard title="Team login" subtitle="Log in with your team name and password." spider>
      <LoginForm
        endpoint="/api/auth/login"
        next={target}
        usernameLabel="Team name"
        compact
        notice={isSessionEndReason(reason) ? SESSION_ENDED_MESSAGES[reason] : undefined}
      />
    </AuthCard>
  );
}
