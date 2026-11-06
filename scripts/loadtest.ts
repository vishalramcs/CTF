// Load test against a deployed site, using hidden throwaway teams named "LT 01".."LT nn".
//   pnpm loadtest setup 70      creates the teams in DATABASE_URL (hidden, so never on the board)
//   pnpm loadtest run https://spidey-tracxer.vercel.app
//   pnpm loadtest cleanup       deletes them, their sessions, attempts and login rows
// Each simulated team: logs in, opens the dashboard, lists questions, polls Flashy and the public
// board every 5 s for DURATION_S, and sends 3 wrong flags. Prints latency per endpoint.
import { and, eq, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';
import { regenerateVariants } from '@/lib/variants/regenerate';

const PREFIX = 'LT ';
const DURATION_S = Number(process.env.DURATION_S ?? 60);
const names = (n: number) =>
  Array.from({ length: n }, (_, i) => `${PREFIX}${String(i + 1).padStart(2, '0')}`);

async function withDb<T>(run: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>) {
  const client = postgres(env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });
  try {
    return await run(drizzle(client, { schema }));
  } finally {
    await client.end();
  }
}

async function setup(count: number) {
  const list = names(count);
  const hashes: string[] = [];
  for (const name of list) hashes.push(await hashPassword(teamPassword(name)));
  await withDb((db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.teams)
        .values(
          list.map((name) => ({
            name,
            slug: name.toLowerCase().replace(' ', '-'),
            isHidden: true,
          })),
        )
        .returning({ id: schema.teams.id });
      await tx.insert(schema.users).values(
        rows.map((r, i) => ({
          username: list[i],
          passwordHash: hashes[i],
          role: 'team' as const,
          teamId: r.id,
        })),
      );
      for (const r of rows) await regenerateVariants(tx, { teamId: r.id });
      await tx.insert(schema.auditLog).values({
        actorId: null,
        action: 'loadtest.setup',
        entityType: 'team',
        details: { count },
      });
    }),
  );
  console.log(`created ${count} hidden teams (${list[0]} .. ${list.at(-1)})`);
}

async function cleanup() {
  await withDb((db) =>
    db.transaction(async (tx) => {
      const gone = await tx
        .delete(schema.teams)
        .where(and(like(schema.teams.name, `${PREFIX}%`), eq(schema.teams.isHidden, true)))
        .returning({ id: schema.teams.id });
      await tx
        .delete(schema.loginAttempts)
        .where(like(schema.loginAttempts.username, `${PREFIX}%`));
      await tx.insert(schema.auditLog).values({
        actorId: null,
        action: 'loadtest.cleanup',
        entityType: 'team',
        details: { count: gone.length },
      });
      console.log(`deleted ${gone.length} load-test teams`);
    }),
  );
}

const samples = new Map<string, { ms: number[]; errors: Map<string, number> }>();
async function timed(label: string, run: () => Promise<Response>): Promise<Response | null> {
  const entry = samples.get(label) ?? { ms: [] as number[], errors: new Map<string, number>() };
  samples.set(label, entry);
  const start = performance.now();
  try {
    const res = await run();
    await res.clone().arrayBuffer();
    entry.ms.push(performance.now() - start);
    if (!res.ok)
      entry.errors.set(String(res.status), (entry.errors.get(String(res.status)) ?? 0) + 1);
    return res;
  } catch (e) {
    const key = e instanceof Error ? e.message.slice(0, 40) : 'error';
    entry.errors.set(key, (entry.errors.get(key) ?? 0) + 1);
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function team(base: string, name: string) {
  const login = await timed('login', () =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: name, password: teamPassword(name) }),
    }),
  );
  if (!login?.ok) return;
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const { csrf } = (await login.json()) as { csrf: string };
  const get = (label: string, path: string) =>
    timed(label, () => fetch(`${base}${path}`, { headers: { cookie } }));

  await get('dashboard page', '/dashboard');
  const list = await get('GET /api/challenges', '/api/challenges');
  const cards = list?.ok
    ? ((await list.json()) as { challenges?: { number: number }[] }).challenges
    : [];
  const number = cards?.[0]?.number;

  const end = Date.now() + DURATION_S * 1000;
  let wrong = 0;
  await sleep(Math.random() * 5000); // browsers don't poll in lockstep
  while (Date.now() < end) {
    await Promise.all([
      get('GET /api/flashy', '/api/flashy'),
      get('GET /api/public/state', '/api/public/state'),
    ]);
    if (number !== undefined && wrong < 3) {
      wrong++;
      await timed('submit (wrong flag)', () =>
        fetch(`${base}/api/challenges/${number}/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie },
          body: JSON.stringify({ flag: `SPIDEY{loadtest_wrong_${wrong}}` }),
        }),
      );
    }
    await sleep(5000);
  }
  await timed('logout', () =>
    fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie },
      body: '{}',
    }),
  );
}

async function run(base: string) {
  const count = await withDb(async (db) =>
    Number(
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(schema.teams)
          .where(like(schema.teams.name, `${PREFIX}%`))
      )[0].n,
    ),
  );
  if (count === 0) throw new Error('Run setup first.');
  console.log(
    `${count} teams, all logging in at once, then ${DURATION_S}s of polling, against ${base}`,
  );
  const started = performance.now();
  await Promise.all(names(count).map((name) => team(base.replace(/\/$/, ''), name)));
  console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
  const pct = (xs: number[], p: number) =>
    xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
  for (const [label, { ms, errors }] of samples) {
    const s = [...ms].sort((a, b) => a - b);
    const errs = [...errors].map(([k, v]) => `${k}×${v}`).join(' ') || 'none';
    console.log(
      `${label.padEnd(22)} n=${String(s.length).padStart(4)}  p50=${pct(s, 50)?.toFixed(0)}ms  p95=${pct(s, 95)?.toFixed(0)}ms  max=${s.at(-1)?.toFixed(0)}ms  non-2xx/errors: ${errs}`,
    );
  }
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'setup') await setup(Number(arg ?? 70));
  else if (mode === 'run') await run(arg ?? 'https://spidey-tracxer.vercel.app');
  else if (mode === 'cleanup') await cleanup();
  else console.log('usage: pnpm loadtest setup [n] | run [baseUrl] | cleanup');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
