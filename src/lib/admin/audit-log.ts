import { and, desc, eq, gte, like, lt, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { localDateTime } from '@/lib/admin/http';
import { db } from '@/lib/db/client';
import { auditLog, users } from '@/lib/db/schema';
import { env } from '@/lib/env';

export const auditFilters = z.object({
  actor: z.string().trim().max(64).optional(),
  action: z.string().trim().max(64).optional(),
  from: localDateTime.optional(),
  to: localDateTime.optional(),
  before: z.coerce.number().int().positive().optional(),
});

export type AuditFilters = z.infer<typeof auditFilters>;

// A blank field in the filter form arrives as an empty string.
export function auditFiltersFrom(query: Record<string, unknown>) {
  return auditFilters.safeParse(
    Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')),
  );
}

const inEventZone = (value: string) => sql`${value}::timestamp AT TIME ZONE ${env.EVENT_TIMEZONE}`;

export function listAudit(filters: AuditFilters, limit: number) {
  const { actor, action, from, to, before } = filters;
  const conditions: (SQL | undefined)[] = [
    actor ? eq(sql`lower(${users.username})`, actor.toLowerCase()) : undefined,
    action ? like(auditLog.action, `${action.replace(/[\\%_]/g, '\\$&')}%`) : undefined,
    from ? gte(auditLog.createdAt, inEventZone(from)) : undefined,
    to ? lte(auditLog.createdAt, inEventZone(to)) : undefined,
    before ? lt(auditLog.id, before) : undefined,
  ];
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      actor: users.username,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      details: auditLog.details,
      ip: auditLog.ip,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}
