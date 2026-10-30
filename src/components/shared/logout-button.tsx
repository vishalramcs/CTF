'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api-client';

export function LogoutButton({ loginPath }: { loginPath: string }) {
  const [failed, setFailed] = useState(false);

  async function logout() {
    setFailed(false);
    try {
      const res = await apiPost('/api/auth/logout');
      if (res.ok) {
        window.location.assign(loginPath);
        return;
      }
    } catch {
      // Offline: the session is still alive, so say so below rather than pretend.
    }
    setFailed(true);
  }

  return (
    <span className="flex items-center gap-3">
      {failed && (
        <span role="alert" className="text-sm text-destructive">
          Couldn&apos;t log out. Try again.
        </span>
      )}
      <Button variant="outline" onClick={logout} className="h-11 px-4">
        Log out
      </Button>
    </span>
  );
}
