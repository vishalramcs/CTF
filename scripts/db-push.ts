// Applies supabase/migrations/ to DIRECT_DATABASE_URL. Needs no Docker.
import { execSync } from 'node:child_process';

const url = process.env.DIRECT_DATABASE_URL;
if (!url) throw new Error('DIRECT_DATABASE_URL is not set');

execSync(`pnpm exec supabase db push --db-url "${url}"`, { stdio: 'inherit' });
