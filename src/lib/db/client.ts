import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/lib/env';
import * as schema from './schema';

// Supavisor transaction pooler: no prepared statements, one connection per serverless instance.
const raw = postgres(env.DATABASE_URL, { prepare: false, max: 1 });

// Supavisor hangs when the driver pipelines a query behind one that has no parameters, and no
// driver setting stops that (max_pipeline 0 breaks transactions). So concurrent requests take
// turns. Inside a transaction Drizzle uses the transaction's own client, which skips this queue.
let last: Promise<unknown> = Promise.resolve();
function inTurn<T>(run: () => PromiseLike<T>): Promise<T> {
  const turn = last.then(run);
  last = turn.catch(() => {});
  return turn;
}

const client = new Proxy(raw, {
  get(target, key, receiver) {
    if (key === 'begin') {
      return (...args: unknown[]) => inTurn(() => Reflect.apply(raw.begin, raw, args));
    }
    if (key === 'unsafe') {
      return (...args: unknown[]) => {
        const query = () => Reflect.apply(raw.unsafe, raw, args);
        return {
          values: () => inTurn(() => query().values()),
          then: (ok: never, fail: never) => inTurn(query).then(ok, fail),
        };
      };
    }
    return Reflect.get(target, key, receiver);
  },
});

export const db = drizzle({ client, schema });
