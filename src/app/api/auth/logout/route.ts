import { NextResponse } from 'next/server';

import { audit } from '@/lib/audit';
import { isValidCsrf } from '@/lib/auth/csrf';
import { lookupSession, revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { ApiError, clientIp, withPublic } from '@/lib/http';

export const runtime = 'nodejs';

// Not withTeam(): both roles log out here, and a dead session must still be able to clear its
// cookie.
export const POST = withPublic(async (req) => {
  const result = await lookupSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (result.ok) {
    const { id, userId, role } = result.session;
    if (!isValidCsrf(id, req.headers.get('x-csrf-token'))) {
      throw new ApiError(403, 'csrf', 'Reload the page and try again.');
    }
    await revokeSession(id, 'logout');
    if (role === 'admin') {
      await audit(db, {
        actorId: userId,
        action: 'admin.logout',
        entityType: 'session',
        entityId: id,
        ip: clientIp(req),
      });
    }
  }
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
