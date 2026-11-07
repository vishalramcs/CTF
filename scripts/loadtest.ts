// Load test against a deployed site, using hidden throwaway teams named "LT 01".."LT nn".
//   pnpm loadtest setup 70      creates the teams in DATABASE_URL (hidden, so never on the board)
//   pnpm loadtest run https://spidey-tracxer.vercel.app
//   pnpm loadtest cleanup       deletes them, their sessions, attempts and login rows
//   pnpm loadtest full [baseUrl] whole journey: every question page, hint, a workspace file, a wrong
//                               and the correct flag for all 13 (Q9 unlocked first), locations,
//                               surprises, leaderboard; then checks the database for double awards.
// `run` only: logs in, opens the dashboard, polls Flashy and the public board every 5 s for
// DURATION_S, and sends 3 wrong flags. Both print latency per endpoint.
// Correct flags are matched from the organiser references in seed-output/ against each team's
// stored hash, and are never printed.
import { readFileSync } from 'node:fs';

import { and, eq, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';
import { checkFlag } from '@/lib/flags/verify';
import { regenerateVariants } from '@/lib/variants/regenerate';
import { WORKSPACES } from '@/lib/workspace/definitions';

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

type Plan = { number: number; flag?: string; file?: string }[];

// For each question: the correct flag (from the organiser references) and one workspace file.
async function loadPlan(): Promise<Plan> {
  const text = ['question-reference.md', 'held-questions.md', 'answers-2026-11-07.json']
    .map((f) => readFileSync(`seed-output/${f}`, 'utf-8'))
    .join('\n');
  const candidates = [...new Set(text.match(/[A-Z]+\{[^}\s]+\}/g) ?? [])];
  const rows = await withDb((db) =>
    db.execute<{ number: number; ws: string | null; expected: string }>(sql`
      SELECT c.number, c.generator_config->>'workspace' AS ws, v.expected_flag_hash AS expected
      FROM app.challenges c
      JOIN app.team_challenge_variants v ON v.challenge_id = c.id
      JOIN app.teams t ON t.id = v.team_id AND t.name = ${`${PREFIX}01`}
      WHERE c.is_published ORDER BY c.number`),
  );
  const keys = { flagKey: env.FLAG_HMAC_KEY, flagPrefix: env.FLAG_PREFIX };
  return rows.map((r) => ({
    number: r.number,
    flag: candidates.find((c) => checkFlag(c, r.expected, keys).result === 'correct'),
    file: r.ws && Object.hasOwn(WORKSPACES, r.ws) ? WORKSPACES[r.ws].files[0]?.key : undefined,
  }));
}

async function fullTeam(base: string, name: string, plan: Plan) {
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
  const post = (label: string, path: string, body: unknown = {}) =>
    timed(label, () =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie },
        body: JSON.stringify(body),
      }),
    );

  let done = false;
  const poller = (async () => {
    await sleep(Math.random() * 5000);
    while (!done) {
      await Promise.all([
        get('poll /api/flashy', '/api/flashy'),
        get('poll /api/public/state', '/api/public/state'),
      ]);
      await sleep(5000);
    }
  })();

  await get('page /dashboard', '/dashboard');
  await get('page /leaderboard', '/leaderboard');
  await get('GET /api/me', '/api/me');
  await get('GET /api/challenges', '/api/challenges');
  await get('GET /api/surprises', '/api/surprises');
  await get('GET /api/announcements', '/api/announcements');
  await post(
    'workspace delete (Q9 unlock)',
    '/api/challenges/5/workspace/files/mj_cache.tmp/delete',
  );

  // Regular questions in a random order, the Main Question last, as a real team would.
  const order = plan
    .filter((q) => q.number !== 13)
    .sort(() => Math.random() - 0.5)
    .concat(plan.filter((q) => q.number === 13));
  for (const q of order) {
    await get('page /challenge/[n]', `/challenge/${q.number}`);
    await get('GET /api/challenges/[n]', `/api/challenges/${q.number}`);
    await post('POST hint', `/api/challenges/${q.number}/hints`, { index: 1 });
    if (q.file) {
      await get('workspace file', `/api/challenges/${q.number}/workspace/files/${q.file}`);
    }
    await post('submit wrong flag', `/api/challenges/${q.number}/submit`, {
      flag: `${env.FLAG_PREFIX}{loadtest_wrong}`,
    });
    if (q.flag) {
      const res = await post('submit CORRECT flag', `/api/challenges/${q.number}/submit`, {
        flag: q.flag,
      });
      const body = res?.ok ? ((await res.json()) as { result?: string }) : {};
      if (body.result !== 'correct') {
        const entry = samples.get('submit CORRECT flag')!;
        const key = `result:${body.result}`;
        entry.errors.set(key, (entry.errors.get(key) ?? 0) + 1);
      }
    }
    await get('GET /api/coordinates', '/api/coordinates');
    await sleep(500 + Math.random() * 2500); // reading time
  }
  await get('page /history', '/history');
  done = true;
  await poller;
  await post('logout', '/api/auth/logout');
}

// After the run: every award happened exactly once and positions are a clean 1..n per question.
async function verify(count: number, expectedSolves: number) {
  const [r] = await withDb((db) =>
    db.execute<Record<string, number>>(sql`
      WITH lt AS (SELECT id FROM app.teams WHERE name LIKE ${`${PREFIX}%`})
      SELECT
        (SELECT count(*) FROM app.solves WHERE team_id IN (SELECT id FROM lt))::int AS solves,
        (SELECT count(*) FROM (SELECT team_id, challenge_id FROM app.solves
           GROUP BY 1, 2 HAVING count(*) > 1) d)::int AS duplicate_solves,
        (SELECT count(*) FROM (SELECT challenge_id, solve_position FROM app.solves
           GROUP BY 1, 2 HAVING count(*) > 1) d)::int AS duplicate_positions,
        (SELECT count(*) FROM (SELECT challenge_id FROM app.solves GROUP BY 1
           HAVING max(solve_position) <> count(*)) d)::int AS position_gaps,
        (SELECT count(*) FROM app.score_transactions WHERE team_id IN (SELECT id FROM lt)
           AND category = 'challenge')::int AS challenge_ledger_rows,
        (SELECT count(*) FROM app.teams t WHERE NOT t.is_hidden AND EXISTS (SELECT 1 FROM app.solves s
           WHERE s.team_id = t.id AND s.solved_at > now() - interval '15 minutes'))::int
           AS real_teams_solving_meanwhile`),
  );
  console.log(`\ndatabase check (${count} teams, ${expectedSolves} correct submits expected):`);
  for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(30)} ${v}`);
}

async function full(base: string) {
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
  const plan = await loadPlan();
  const withFlag = plan.filter((q) => q.flag).map((q) => q.number);
  console.log(
    `${count} teams, full journey over ${plan.length} questions against ${base}. ` +
      `Correct flag known for: ${withFlag.join(', ') || 'none'}`,
  );
  const started = performance.now();
  await Promise.all(names(count).map((name) => fullTeam(base.replace(/\/$/, ''), name, plan)));
  console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
  report();
  await verify(count, count * withFlag.length);
}

function report() {
  const pct = (xs: number[], p: number) =>
    xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
  for (const [label, { ms, errors }] of samples) {
    const s = [...ms].sort((a, b) => a - b);
    const errs = [...errors].map(([k, v]) => `${k}×${v}`).join(' ') || 'none';
    console.log(
      `${label.padEnd(30)} n=${String(s.length).padStart(5)}  p50=${pct(s, 50)?.toFixed(0)}ms  p95=${pct(s, 95)?.toFixed(0)}ms  max=${s.at(-1)?.toFixed(0)}ms  non-2xx/errors: ${errs}`,
    );
  }
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
  report();
}

async function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'setup') await setup(Number(arg ?? 70));
  else if (mode === 'run') await run(arg ?? 'https://spidey-tracxer.vercel.app');
  else if (mode === 'full') await full(arg ?? 'https://spidey-tracxer.vercel.app');
  else if (mode === 'cleanup') await cleanup();
  else console.log('usage: pnpm loadtest setup [n] | run [baseUrl] | full [baseUrl] | cleanup');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
