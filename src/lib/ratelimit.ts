import { and, count, eq, gt, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { loginAttempts } from '@/lib/db/schema';

const LOGIN_FAILS_PER_USERNAME = 10;
const LOGIN_FAILS_PER_IP = 30;

async function secondsBlocked(key: SQL, limit: number): Promise<number> {
  const [row] = await db
    .select({
      fails: count(),
      // Once the oldest failure leaves the window, the count drops back under the limit.
      seconds: sql<number>`ceil(extract(epoch from
        min(${loginAttempts.createdAt}) + interval '10 minutes' - now()))::int`,
    })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.success, false),
        gt(loginAttempts.createdAt, sql`now() - interval '10 minutes'`),
        key,
      ),
    );
  return row.fails >= limit ? Math.max(row.seconds, 1) : 0;
}

// Seconds until a login may be tried again, 0 if it may be tried now.
// shortcut: the count isn't atomic with the insert, so a parallel burst can pass the limit by a
// few guesses. Team passwords have 60 random bits, so that's harmless; lock if that ever changes.
export async function loginRetryAfter(username: string, ip: string | null): Promise<number> {
  const byUsername = secondsBlocked(
    sql`lower(${loginAttempts.username}) = lower(${username})`,
    LOGIN_FAILS_PER_USERNAME,
  );
  const byIp = ip ? secondsBlocked(eq(loginAttempts.ip, ip), LOGIN_FAILS_PER_IP) : 0;
  return Math.max(await byUsername, await byIp);
}
