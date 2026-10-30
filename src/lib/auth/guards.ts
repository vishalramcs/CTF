import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import {
  lookupSession,
  SESSION_COOKIE,
  type AdminSession,
  type TeamSession,
} from '@/lib/auth/session';

// Layout and page both guard, so this keeps it to one query per render.
export const currentSession = cache(async () =>
  lookupSession((await cookies()).get(SESSION_COOKIE)?.value),
);

function loginUrl(path: string, reason: string): string {
  return reason === 'none' ? path : `${path}?reason=${reason}`;
}

export async function requireTeam(): Promise<TeamSession> {
  const result = await currentSession();
  if (!result.ok) redirect(loginUrl('/login', result.reason));
  if (result.session.role !== 'team') redirect('/admin');
  return result.session;
}

export async function requireAdmin(): Promise<AdminSession> {
  const result = await currentSession();
  if (!result.ok) redirect(loginUrl('/admin/login', result.reason));
  if (result.session.role !== 'admin') redirect('/dashboard');
  return result.session;
}
