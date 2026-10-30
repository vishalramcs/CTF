import { csrfToken } from '@/lib/auth/csrf';
import { lookupSession, SESSION_COOKIE } from '@/lib/auth/session';
import { json, sessionEndedResponse, withPublic } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = withPublic(async (req) => {
  const result = await lookupSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!result.ok) return sessionEndedResponse(result.reason);
  const { id, role, teamName } = result.session;
  return json({ role, teamName: teamName ?? undefined, csrf: csrfToken(id) });
});
