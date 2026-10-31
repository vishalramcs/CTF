// TRD §12 secret-leak scan: crawls a real server as 2 teams, so the HTML, the RSC payload, the JS
// bundles, the response headers and the server's own logs are all covered. This file holds the
// test-run lock throughout, so no other run can wipe the database under the server.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from '@/lib/auth/shared';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { regenerateVariants } from '@/lib/variants/regenerate';
import {
  createChallenge,
  createTeam,
  flagOf,
  openSql,
  sessionFor,
  setStatus,
  tokenOf,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

// Stands in for a location's expected answer, which must never leave the server.
const LOCATION_ANSWER = 'secret-city-xyz';
const ENV_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'SESSION_PEPPER',
  'FLAG_HMAC_KEY',
  'VARIANT_HMAC_KEY',
  'COORD_HMAC_KEY',
  'REVEAL_ENC_KEY',
  'CSRF_SECRET',
  'SEED_ADMIN_PASSWORD',
] as const;

let sql: postgres.Sql;
let server: ChildProcess;
let baseUrl: string;
let serverLog = '';
let teams: { id: string; name: string; auth: Auth }[];
let challenges: TestChallenge[];
// label -> value. Assertions report labels only, so a failure can't print a secret.
let alwaysForbidden: Map<string, string>;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ok = await fetch(`${baseUrl}/robots.txt`).then(
      (res) => res.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('next dev did not start in time');
}

beforeAll(async () => {
  sql = openSql();
  await wipeAppTables(sql);
  const ids = [await createTeam(sql, 'teama'), await createTeam(sql, 'teamb')];
  teams = [
    { id: ids[0], name: 'teama', auth: await sessionFor(sql, 'teama') },
    { id: ids[1], name: 'teamb', auth: await sessionFor(sql, 'teamb') },
  ];

  const surfaces = {
    htmlComment: 'clue {{token}}',
    metaTags: [{ name: 'clue-meta', content: 'meta {{token}}' }],
    hiddenElements: ['<span data-clue="1">hidden {{token}}</span>'],
    jsonClue: { value: 'json {{token}}' },
    cookies: [{ name: 'clue_a', value: 'cookie {{token}}' }],
    localStorage: [{ key: 'clue_b', value: 'stored {{token}}' }],
    headers: [{ name: 'x-spidey-clue', value: '{{token}}' }],
  };
  challenges = [
    await createChallenge(sql, 1, {
      fragment: { value: '47', order: 3, clue: 'ORDER-CLUE-1' },
      hints: ['HINT-TEXT-1'],
      evidence: [
        { type: 'code', content: '{{flag|hex}}' },
        { type: 'file', name: 'clue.txt' },
      ],
      generatorConfig: { surfaces, files: [{ name: 'clue.txt', content: '{{flag|rot13}}' }] },
    }),
    await createChallenge(sql, 2, { fragment: { value: '00', order: 5, clue: 'ORDER-CLUE-2' } }),
    await createChallenge(sql, 10, { fragment: { value: '11', order: 1, clue: 'ORDER-CLUE-10' } }),
  ];
  await regenerateVariants(db, {});
  await sql`
    UPDATE app.locations
    SET answer_hash = ${hmacHex(env.COORD_HMAC_KEY, LOCATION_ANSWER)},
        answer_enc = 'encrypted-answer-placeholder'`;

  alwaysForbidden = new Map([
    ['location answer', LOCATION_ANSWER],
    ['location answer hash', hmacHex(env.COORD_HMAC_KEY, LOCATION_ANSWER)],
    ['location answer ciphertext', 'encrypted-answer-placeholder'],
  ]);
  for (const name of ENV_SECRETS) {
    const value = process.env[name];
    if (value) alwaysForbidden.set(`env ${name}`, value);
  }
  for (const challenge of challenges) {
    for (const team of teams) {
      alwaysForbidden.set(
        `plaintext flag of ${team.name} on #${challenge.number}`,
        flagOf(team.id, challenge),
      );
    }
  }
  const hashes =
    await sql`SELECT team_id, challenge_id, expected_flag_hash FROM app.team_challenge_variants`;
  hashes.forEach((row, i) => alwaysForbidden.set(`flag hash ${i}`, row.expected_flag_hash));

  const port = await freePort();
  baseUrl = `http://localhost:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk) => (serverLog += chunk));
  server.stderr?.on('data', (chunk) => (serverLog += chunk));
  await waitForServer();
}, 300_000);

afterAll(async () => {
  if (server?.pid) {
    // next dev runs a child server, and on Windows kill() would orphan it.
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // Already gone.
      }
    } else {
      server.kill();
    }
  }
  await sql.end();
  await db.$client.end();
});

type Team = (typeof teams)[number];

function forbiddenFor(team: Team, solved: number[]): Map<string, string> {
  const forbidden = new Map(alwaysForbidden);
  const other = teams.find((t) => t.id !== team.id)!;
  for (const challenge of challenges) {
    forbidden.set(`other team's token on #${challenge.number}`, tokenOf(other.id, challenge));
    forbidden.set(
      `other team's encoded flag on #${challenge.number}`,
      Buffer.from(flagOf(other.id, challenge)).toString('base64'),
    );
    if (!solved.includes(challenge.number)) {
      forbidden.set(`unearned order clue #${challenge.number}`, `ORDER-CLUE-${challenge.number}`);
    }
  }
  return forbidden;
}

type Fetched = { path: string; status: number; text: string };

async function fetchAs(
  team: Team,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Fetched> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    redirect: 'manual',
    headers: {
      cookie: `${SESSION_COOKIE}=${team.auth.cookie}`,
      ...(init.method === 'POST'
        ? { 'content-type': 'application/json', 'x-csrf-token': team.auth.csrf }
        : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const headers = [...res.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
  return { path, status: res.status, text: `${headers}\n${await res.text()}` };
}

function hits(fetched: Fetched[], forbidden: Map<string, string>): string[] {
  return fetched.flatMap(({ path, text }) =>
    [...forbidden]
      .filter(([, value]) => text.includes(value))
      .map(([label]) => `${path}: ${label}`),
  );
}

// Each bundle only needs scanning once per run, and the dev bundles are large.
const scannedScripts = new Set<string>();

async function scriptsIn(team: Team, pages: Fetched[]): Promise<Fetched[]> {
  const sources = pages.flatMap(({ text }) =>
    [...text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) =>
      match[1].replace(/&amp;/g, '&'),
    ),
  );
  const fresh = [...new Set(sources)].filter((src) => !scannedScripts.has(src));
  fresh.forEach((src) => scannedScripts.add(src));
  return Promise.all(fresh.map((src) => fetchAs(team, src)));
}

async function crawl(team: Team, paths: string[]): Promise<Fetched[]> {
  const fetched: Fetched[] = [];
  // In sequence: each server instance has one database connection, and this link is slow.
  for (const path of paths) fetched.push(await fetchAs(team, path));
  return fetched;
}

const PUBLIC_FILES = ['/robots.txt', '/challenges/clue.js'];
const API = ['/api/me', '/api/challenges', '/api/time'];

describe('secret-leak scan', () => {
  it(
    'stays clean through a full running session for both teams',
    { timeout: 600_000 },
    async () => {
      await setStatus(sql, 'running');
      for (const team of teams) {
        const easy = challenges[0];
        const pages = await crawl(team, [
          '/dashboard',
          '/challenge/1',
          '/challenge/2',
          '/challenge/10',
        ]);
        expect(pages.map((page) => page.status)).toEqual([200, 200, 200, 200]);

        // The crawl only proves something if the page really holds this team's variant and clues.
        const token = tokenOf(team.id, easy);
        const page = pages[1].text;
        expect(page).toContain(`<!-- clue ${token} -->`);
        expect(page).toMatch(new RegExp(`<meta name="clue-meta" content="meta ${token}"`));
        expect(page).toContain(`hidden ${token}`);
        expect(page).toMatch(
          new RegExp(`<script id="clue" type="application/json">.*json ${token}`),
        );
        expect(page).toContain(`cookie ${token}`);
        expect(page).toContain('/challenges/clue.js');
        expect(page).toContain(Buffer.from(flagOf(team.id, easy)).toString('hex'));

        const before = [
          ...pages,
          ...(await scriptsIn(team, pages)),
          ...(await crawl(team, [
            ...PUBLIC_FILES,
            ...API,
            ...challenges.map((c) => `/api/challenges/${c.number}`),
            '/api/challenges/1/assets/clue.txt',
            '/vault/challenge-1',
          ])),
          await fetchAs(team, '/api/challenges/1/hints', { method: 'POST', body: { index: 1 } }),
          await fetchAs(team, '/api/challenges/1/submit', {
            method: 'POST',
            body: { flag: 'SPIDEY{nope}' },
          }),
        ];
        expect(hits(before, forbiddenFor(team, []))).toEqual([]);

        // Solving earns this challenge's clue, and nothing else.
        const correct = await fetchAs(team, '/api/challenges/1/submit', {
          method: 'POST',
          body: { flag: flagOf(team.id, easy) },
        });
        expect(correct.text).toContain('"result":"correct"');
        const after = [correct, ...(await crawl(team, ['/dashboard', '/challenge/1', '/api/me']))];
        expect(after[2].text).toContain('ORDER-CLUE-1');
        expect(hits(after, forbiddenFor(team, [1]))).toEqual([]);
      }
    },
  );

  it.each(['not_started', 'ended'] as const)(
    'stays clean when %s',
    { timeout: 300_000 },
    async (status) => {
      await setStatus(sql, status);
      const team = teams[0];
      const fetched = await crawl(team, [
        '/dashboard',
        '/challenge/1',
        '/challenge/2',
        '/api/challenges/1',
        '/api/challenges/2',
        '/api/me',
        '/api/challenges',
        '/vault/challenge-1',
      ]);
      expect(hits(fetched, forbiddenFor(team, [1]))).toEqual([]);

      // Nothing of a locked or closed challenge's variant, not even this team's own.
      const token = tokenOf(team.id, challenges[1]);
      for (const { path, text } of fetched) expect(text, path).not.toContain(token);
    },
  );

  it('wrote no secret to the server log', () => {
    const logged = hits([{ path: 'server log', status: 0, text: serverLog }], alwaysForbidden);
    expect(logged).toEqual([]);
  });
});
