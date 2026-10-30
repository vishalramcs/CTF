import type { db } from '@/lib/db/client';
import { auditLog } from '@/lib/db/schema';

type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  // Never put secrets here.
  details?: Record<string, unknown>;
  ip?: string | null;
};

// Takes the executor so an entry can commit in the same transaction as the change it records.
export async function audit(executor: Pick<typeof db, 'insert'>, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values(entry);
}
