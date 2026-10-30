import type { Sql } from 'postgres';

// Seed and tests truncate every app table. Only a local database, or the one project
// named by WIPEABLE_DB_REF, may be wiped without an explicit --force.
export function isWipeable(databaseUrl: string, wipeableRef: string | undefined): boolean {
  const url = new URL(databaseUrl);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true;
  if (!wipeableRef) return false;
  // Direct host is db.<ref>.supabase.co; pooler username is postgres.<ref>.
  return (
    url.hostname === `db.${wipeableRef}.supabase.co` || url.username === `postgres.${wipeableRef}`
  );
}

export async function wipeAppTables(sql: Sql): Promise<void> {
  // One round trip. event_state references teams, so it has to be truncated too and its
  // singleton re-created.
  await sql.unsafe(`
    DO $$ BEGIN
      EXECUTE (
        SELECT 'TRUNCATE ' || string_agg(format('app.%I', tablename), ', ')
          || ' RESTART IDENTITY CASCADE'
        FROM pg_tables WHERE schemaname = 'app' AND tablename <> 'broadcast_gate'
      );
      INSERT INTO app.event_state (id) VALUES (1);
      UPDATE app.broadcast_gate SET last_sent_at = 'epoch';
    END $$`);
}
