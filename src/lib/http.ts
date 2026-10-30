import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

import { isValidCsrf } from '@/lib/auth/csrf';
import {
  lookupSession,
  SESSION_COOKIE,
  type AdminSession,
  type Session,
  type TeamSession,
} from '@/lib/auth/session';
import { SESSION_ENDED_MESSAGES, type SessionEndReason } from '@/lib/auth/shared';

type RouteContext<P> = { params: Promise<P> };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function error(
  status: number,
  code: string,
  message: string,
  retryAfter?: number,
): NextResponse {
  return json({ error: { code, message, retryAfter } }, { status });
}

// Vercel sets this header itself, so clients can't spoof it. The column is `inet`, so anything
// else must become null rather than fail the insert.
export function clientIp(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  return ip && isIP(ip) ? ip : null;
}

export async function parseBody<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) throw new ApiError(400, 'bad_request', 'Check the fields and try again.');
  return parsed.data;
}

function isMutating(req: NextRequest): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
}

// For routes with no session requirement. A cross-site form can't send this content type.
export function withPublic<P = unknown>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      if (isMutating(req) && !req.headers.get('content-type')?.startsWith('application/json')) {
        throw new ApiError(415, 'unsupported_media_type', 'Send JSON.');
      }
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return error(e.status, e.code, e.message, e.retryAfter);
      const requestId = randomUUID();
      // Log the cause only: Drizzle's own message contains the query parameters.
      const cause = e instanceof Error ? ((e.cause as Error | undefined) ?? e) : undefined;
      console.error(
        JSON.stringify({
          event: 'api_error',
          requestId,
          path: req.nextUrl.pathname,
          name: cause?.name,
          message: cause?.message,
        }),
      );
      return json(
        { error: { code: 'internal', message: 'Signal interference, try again' }, requestId },
        { status: 500 },
      );
    }
  };
}

export function sessionEndedResponse(reason: SessionEndReason | 'none') {
  if (reason === 'none') return error(401, 'unauthenticated', 'Log in first.');
  return json(
    { reason, error: { code: reason, message: SESSION_ENDED_MESSAGES[reason] } },
    { status: 401 },
  );
}

function withRole<S extends Session, P>(
  role: S['role'],
  handler: (req: NextRequest, session: S, ctx: RouteContext<P>) => Promise<Response>,
) {
  return withPublic<P>(async (req, ctx) => {
    const result = await lookupSession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!result.ok) return sessionEndedResponse(result.reason);
    if (result.session.role !== role) throw new ApiError(403, 'forbidden', 'Not allowed.');
    if (isMutating(req) && !isValidCsrf(result.session.id, req.headers.get('x-csrf-token'))) {
      throw new ApiError(403, 'csrf', 'Reload the page and try again.');
    }
    return handler(req, result.session as S, ctx);
  });
}

export function withTeam<P = unknown>(
  handler: (req: NextRequest, session: TeamSession, ctx: RouteContext<P>) => Promise<Response>,
) {
  return withRole<TeamSession, P>('team', handler);
}

export function withAdmin<P = unknown>(
  handler: (req: NextRequest, session: AdminSession, ctx: RouteContext<P>) => Promise<Response>,
) {
  return withRole<AdminSession, P>('admin', handler);
}
