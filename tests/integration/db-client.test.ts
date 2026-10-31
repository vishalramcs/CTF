import { sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { db } from '@/lib/db/client';

afterAll(() => db.$client.end());

// Concurrent requests share one connection. Without the queue in client.ts this mix hangs behind
// Supavisor, which froze real pages while the dashboard was polling.
it('serves overlapping queries and transactions', { timeout: 60_000 }, async () => {
  const work = Array.from({ length: 24 }, (_, i) => {
    if (i % 3 === 0) return db.execute(sql`SELECT 1 AS one`);
    if (i % 3 === 1) return db.execute(sql`SELECT ${i}::int AS one`);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'db-client-test'}))`);
      return tx.execute(sql`SELECT 2 AS one`);
    });
  });
  expect(await Promise.all(work)).toHaveLength(24);
});

it('keeps working after a failed query', { timeout: 60_000 }, async () => {
  await expect(db.execute(sql`SELECT * FROM app.no_such_table`)).rejects.toThrow();
  const rows = await db.execute(sql`SELECT 1 AS one`);
  expect(rows).toHaveLength(1);
});
