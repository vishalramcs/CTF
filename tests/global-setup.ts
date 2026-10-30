// Integration tests wipe the one dev database, so runs from different worktrees must take turns.
// A session advisory lock releases itself if a run dies.
import postgres from 'postgres';

export default async function setup(): Promise<(() => Promise<void>) | void> {
  const url = process.env.DIRECT_DATABASE_URL;
  // Unit-only runs touch no database, so they don't need to wait.
  if (!url || process.argv.some((arg) => arg.includes('tests/unit'))) return;

  // DIRECT_DATABASE_URL is session mode: a transaction-mode connection wouldn't hold the lock.
  const sql = postgres(url, { prepare: false, max: 1 });
  await sql`SELECT pg_advisory_lock(hashtext('spidey:test-run'))`;
  return async () => {
    await sql.end();
  };
}
