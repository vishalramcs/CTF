import type { NextRequest } from 'next/server';
import { z } from 'zod';

import type { AdminSession } from '@/lib/auth/session';
import { SURPRISE_KINDS, type SurpriseKind } from '@/lib/admin/shared';
import { ApiError, clientIp } from '@/lib/http';

export function actor(req: NextRequest, session: AdminSession) {
  return { actorId: session.userId, ip: clientIp(req) };
}

export function parseUuid(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(404, 'not_found', 'Not found.');
  return parsed.data;
}

export function parseKind(value: unknown): SurpriseKind {
  if (!SURPRISE_KINDS.includes(value as SurpriseKind)) {
    throw new ApiError(404, 'not_found', 'Not found.');
  }
  return value as SurpriseKind;
}

// Drizzle wraps the driver's error, so the Postgres code and constraint sit on `cause`.
export function pgError(e: unknown): { code?: string; constraint_name?: string } {
  return ((e as Error | undefined)?.cause ?? e ?? {}) as {
    code?: string;
    constraint_name?: string;
  };
}

// datetime-local input values, read in EVENT_TIMEZONE by the query that uses them.
export const localDateTime = z.iso.datetime({ local: true });

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const NO_STORE = { 'cache-control': 'no-store' };
