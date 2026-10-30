import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/shared/auth-card';
import { buttonVariants } from '@/components/ui/button';
import { currentSession } from '@/lib/auth/guards';

export default async function Home() {
  const result = await currentSession();
  if (result.ok && result.session.role === 'team') redirect('/dashboard');

  return (
    <AuthCard title="Signal lost" subtitle="Search the SpiderXman. Your team starts here.">
      <Link href="/login" className={buttonVariants({ className: 'h-11 w-full text-base' })}>
        Team Login
      </Link>
      <Link
        href="/admin/login"
        className="mt-4 block text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        Organiser login
      </Link>
    </AuthCard>
  );
}
