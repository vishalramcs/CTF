import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/lib/env';
import * as schema from './schema';

// Supavisor transaction pooler: no prepared statements, one connection per serverless instance.
const client = postgres(env.DATABASE_URL, { prepare: false, max: 1 });

export const db = drizzle({ client, schema });
