// R5 acceptance: docs/07 §5 surprises, through the real route handlers.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as discoverRoute } from '@/app/api/surprises/[kind]/discover/route';
import { POST as submitRoute } from '@/app/api/surprises/[kind]/submit/route';
import { GET as listRoute } from '@/app/api/surprises/route';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import type { SurpriseKind } from '@/lib/surprises/state';
import {
  createTeam,
  openSql,
  params,
  request,
  sessionFor,
  setStatus,
  type Auth,
} from './challenge-helpers';

const ANSWERS: Record<SurpriseKind, string> = {
  spidey_signal: 'zephyr quartz lantern',
  flashy_spider: 'obsidian marmalade',
  spider_mutation: 'vermilion trapeze',
};
const CIPHERTEXT = 'ciphertext-sentinel-9f3a';
const KINDS = Object.keys(ANSWERS) as SurpriseKind[];
const hashOf = (answer: string) => hmacHex(env.FLAG_HMAC_KEY, `surprise:${answer}`);

let sql: postgres.Sql;
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  teamA = await createTeam(sql, 'teama');
  teamB = await createTeam(sql, 'teamb');
  authA = await sessionFor(sql, 'teama');
  authB = await sessionFor(sql, 'teamb');
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

function enable(kind: SurpriseKind) {
  return sql`
    UPDATE app.surprise_events
       SET enabled = true, answer_hash = ${hashOf(ANSWERS[kind])}, answer_enc = ${CIPHERTEXT},
           content_html = ${`<p>Task for ${kind}</p>`}
     WHERE kind = ${kind}`;
}

async function list(auth = authA) {
  const res = await listRoute(request('/api/surprises', { auth }), params({}));
  expect(res.status).toBe(200);
  return (await res.json()).surprises;
}

async function discover(kind: string, auth = authA) {
  const res = await discoverRoute(
    request(`/api/surprises/${kind}/discover`, { method: 'POST', auth }),
    params({ kind }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

async function submit(kind: string, answer: string, auth = authA) {
  const res = await submitRoute(
    request(`/api/surprises/${kind}/submit`, { method: 'POST', auth, body: { answer } }),
    params({ kind }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

const progress = () => sql`
  SELECT team_id, discovered_at, completed_at FROM app.surprise_progress ORDER BY team_id`;
const attempts = () => sql`
  SELECT team_id, submitted_hash, is_correct FROM app.surprise_submissions ORDER BY id`;
const ledger = () => sql`
  SELECT team_id, category, points::text AS points, ref_type, ref_id
    FROM app.score_transactions ORDER BY id`;

describe('availability', () => {
  it('lists nothing while disabled, even with an answer configured', async () => {
    await enable('spidey_signal');
    await sql`UPDATE app.surprise_events SET enabled = false`;
    expect(await list()).toEqual([]);
    expect(await discover('spidey_signal')).toEqual({ result: 'unavailable' });
  });

  it('lists nothing before available_from', async () => {
    await enable('spidey_signal');
    await sql`UPDATE app.surprise_events SET available_from = now() + interval '1 hour'`;
    expect(await list()).toEqual([]);
    expect(await discover('spidey_signal')).toEqual({ result: 'unavailable' });
  });

  it('lists nothing after available_until', async () => {
    await enable('spidey_signal');
    await sql`UPDATE app.surprise_events SET available_until = now() - interval '1 second'`;
    expect(await list()).toEqual([]);
    expect(await discover('spidey_signal')).toEqual({ result: 'unavailable' });
  });

  it('lists nothing with no answer configured', async () => {
    await enable('spidey_signal');
    await sql`UPDATE app.surprise_events SET answer_hash = NULL`;
    expect(await list()).toEqual([]);
    expect(await discover('spidey_signal')).toEqual({ result: 'unavailable' });
    expect(await progress()).toHaveLength(0);
  });

  it('lists a surprise inside its window, without title or content', async () => {
    await enable('flashy_spider');
    await sql`
      UPDATE app.surprise_events
         SET available_from = now() - interval '1 hour', available_until = now() + interval '1 hour'`;
    const body = await list();
    expect(body).toEqual([
      { kind: 'flashy_spider', discovered: false, completed: false, points: 50 },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/Flashy Spider|Task for/);
  });

  it('keeps a discovered surprise listed once closed, but stops taking answers', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    await sql`UPDATE app.surprise_events SET enabled = false`;
    expect(await list()).toEqual([
      { kind: 'spidey_signal', discovered: true, completed: false, points: 30 },
    ]);
    expect(await discover('spidey_signal')).toMatchObject({ result: 'ok' });
    expect(await submit('spidey_signal', ANSWERS.spidey_signal)).toEqual({ result: 'unavailable' });
    expect(await attempts()).toHaveLength(0);
  });
});

describe('discover', () => {
  it('records the time once and returns the content', async () => {
    await enable('flashy_spider');
    await sql`UPDATE app.surprise_events SET asset_url = 'https://example.test/v.mp4'`;
    expect(await discover('flashy_spider')).toEqual({
      result: 'ok',
      kind: 'flashy_spider',
      title: 'Flashy Spider',
      html: '<p>Task for flashy_spider</p>',
      assetUrl: 'https://example.test/v.mp4',
      points: 50,
      completed: false,
    });
    const [first] = await progress();
    await sql`UPDATE app.surprise_progress SET discovered_at = discovered_at - interval '5 minutes'`;
    const [aged] = await progress();
    await discover('flashy_spider');
    const rows = await progress();
    expect(rows).toHaveLength(1);
    expect(rows[0].discovered_at).toEqual(aged.discovered_at);
    expect(rows[0].discovered_at).not.toEqual(first.discovered_at);
    expect(rows[0].completed_at).toBeNull();
    expect(await list()).toEqual([
      { kind: 'flashy_spider', discovered: true, completed: false, points: 50 },
    ]);
  });

  it('strips script tags from the content', async () => {
    await enable('spidey_signal');
    await sql`
      UPDATE app.surprise_events
         SET content_html = '<p onclick="x()">Hi</p><script>alert(1)</script><img src="javascript:x">'`;
    const { html } = await discover('spidey_signal');
    expect(html).not.toMatch(/<script|onclick|javascript:/i);
    expect(html).toContain('<p>Hi</p>');
  });

  it('reports completed on a repeat after solving', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    await submit('spidey_signal', ANSWERS.spidey_signal);
    expect(await discover('spidey_signal')).toMatchObject({ result: 'ok', completed: true });
  });
});

describe('submit', () => {
  it('refuses an answer before discovery', async () => {
    await enable('spidey_signal');
    expect(await submit('spidey_signal', ANSWERS.spidey_signal)).toEqual({ result: 'unavailable' });
    expect(await attempts()).toHaveLength(0);
    expect(await ledger()).toHaveLength(0);
  });

  it('pays exactly 30, 50 and 70, visible on the scoreboard', async () => {
    const expected = { spidey_signal: 30, flashy_spider: 50, spider_mutation: 70 };
    for (const kind of KINDS) {
      await enable(kind);
      await discover(kind);
      expect(await submit(kind, ANSWERS[kind])).toEqual({
        result: 'correct',
        points: expected[kind],
      });
    }
    expect((await ledger()).map((l) => [l.category, l.points, l.ref_type])).toEqual([
      ['surprise', '30.00', 'surprise'],
      ['surprise', '50.00', 'surprise'],
      ['surprise', '70.00', 'surprise'],
    ]);
    const [board] = await sql`
      SELECT surprise_points::text AS surprise_points, total::text AS total, surprises
        FROM app.v_scoreboard WHERE team_id = ${teamA}`;
    expect(board).toEqual({ surprise_points: '150.00', total: '150.00', surprises: 3 });
    expect((await list()).every((s: { completed: boolean }) => s.completed)).toBe(true);
  });

  it('writes the correct row, the completion time and the event as the ledger ref', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    await submit('spidey_signal', ANSWERS.spidey_signal);
    expect((await attempts())[0]).toEqual({
      team_id: teamA,
      submitted_hash: hashOf(ANSWERS.spidey_signal),
      is_correct: true,
    });
    expect((await progress())[0].completed_at).not.toBeNull();
    const [event] = await sql`SELECT id FROM app.surprise_events WHERE kind = 'spidey_signal'`;
    expect((await ledger())[0].ref_id).toBe(event.id);
  });

  it('answers already_completed on a repeat, with no second row of any kind', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    await submit('spidey_signal', ANSWERS.spidey_signal);
    expect(await submit('spidey_signal', ANSWERS.spidey_signal)).toEqual({
      result: 'already_completed',
    });
    expect(await ledger()).toHaveLength(1);
    expect(await attempts()).toHaveLength(1);
  });

  it('matches after trim, case and repeated-space changes', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    expect(await submit('spidey_signal', '  ZEPHYR   Quartz\t lantern\n')).toMatchObject({
      result: 'correct',
    });
  });

  it('treats empty input as wrong and stores a hash, never the text', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    expect(await submit('spidey_signal', '   ')).toEqual({ result: 'wrong', attemptsLeft: 7 });
    expect(await submit('spidey_signal', 'bad\0guess')).toEqual({
      result: 'wrong',
      attemptsLeft: 6,
    });
    const rows = await attempts();
    expect(rows.map((r) => r.is_correct)).toEqual([false, false]);
    for (const row of rows) expect(row.submitted_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await ledger()).toHaveLength(0);
  });

  it("keeps one team's completion away from another's", async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    await discover('spidey_signal', authB);
    await submit('spidey_signal', ANSWERS.spidey_signal);
    expect(await list(authB)).toEqual([
      { kind: 'spidey_signal', discovered: true, completed: false, points: 30 },
    ]);
    expect(await submit('spidey_signal', ANSWERS.spidey_signal, authB)).toMatchObject({
      result: 'correct',
      points: 30,
    });
    expect((await ledger()).map((l) => l.team_id).sort()).toEqual([teamA, teamB].sort());
  });

  it('gives unknown kinds a 404 and over-long answers a 400', async () => {
    const auth = authA;
    const missing = await discoverRoute(
      request('/api/surprises/nope/discover', { method: 'POST', auth }),
      params({ kind: 'nope' }),
    );
    expect(missing.status).toBe(404);
    const missingSubmit = await submitRoute(
      request('/api/surprises/nope/submit', { method: 'POST', auth, body: { answer: 'x' } }),
      params({ kind: 'nope' }),
    );
    expect(missingSubmit.status).toBe(404);
    const long = await submitRoute(
      request('/api/surprises/spidey_signal/submit', {
        method: 'POST',
        auth,
        body: { answer: 'x'.repeat(501) },
      }),
      params({ kind: 'spidey_signal' }),
    );
    expect(long.status).toBe(400);
  });
});

describe('rate limit', () => {
  beforeEach(async () => {
    await enable('spidey_signal');
    await enable('flashy_spider');
    await discover('spidey_signal');
    await discover('flashy_spider');
    await discover('spidey_signal', authB);
  });

  it('wrong costs nothing; the 9th wrong in 60 s is limited and writes no row', async () => {
    for (const left of [7, 6, 5, 4, 3, 2, 1, 0]) {
      expect(await submit('spidey_signal', 'nope')).toEqual({
        result: 'wrong',
        attemptsLeft: left,
      });
    }
    const limited = await submit('spidey_signal', 'nope');
    expect(limited.result).toBe('rate_limited');
    expect(limited.retryAfter).toBeGreaterThanOrEqual(1);
    expect(limited.retryAfter).toBeLessThanOrEqual(60);
    expect((await submit('spidey_signal', ANSWERS.spidey_signal)).result).toBe('rate_limited');
    expect(await attempts()).toHaveLength(5);
    expect(await ledger()).toHaveLength(0);

    // Another surprise and another team keep their own counters.
    expect((await submit('flashy_spider', 'nope')).result).toBe('wrong');
    expect((await submit('spidey_signal', 'nope', authB)).result).toBe('wrong');
  });

  it('frees up once the attempts leave the 60 s window', async () => {
    for (let i = 0; i < 8; i++) await submit('spidey_signal', 'nope');
    await sql`UPDATE app.surprise_submissions SET submitted_at = now() - interval '61 seconds'`;
    expect(await submit('spidey_signal', ANSWERS.spidey_signal)).toMatchObject({
      result: 'correct',
    });
  });
});

describe('event status', () => {
  it.each(['not_started', 'paused', 'ended'] as const)(
    'closes submits while %s',
    async (status) => {
      await enable('spidey_signal');
      await discover('spidey_signal');
      await setStatus(sql, status);
      expect(await submit('spidey_signal', ANSWERS.spidey_signal)).toEqual({ result: 'closed' });
      expect(await attempts()).toHaveLength(0);
      expect(await ledger()).toHaveLength(0);
    },
  );

  it('closes submits when submissions are switched off', async () => {
    await enable('spidey_signal');
    await discover('spidey_signal');
    await sql`UPDATE app.event_state SET submissions_open = false`;
    expect(await submit('spidey_signal', ANSWERS.spidey_signal)).toEqual({ result: 'closed' });
  });
});

describe('leaks', () => {
  it('never sends the answer, its hash or its ciphertext from any route', async () => {
    for (const kind of KINDS) await enable(kind);
    const responses: unknown[] = [await list()];
    for (const kind of KINDS) {
      responses.push(await discover(kind));
      responses.push(await list());
      responses.push(await submit(kind, 'nope'));
      responses.push(await submit(kind, ANSWERS[kind]));
      responses.push(await submit(kind, ANSWERS[kind]));
      responses.push(await discover(kind));
    }
    responses.push(await list());
    const text = JSON.stringify(responses);
    for (const answer of Object.values(ANSWERS)) {
      expect(text).not.toContain(answer);
      expect(text).not.toContain(hashOf(answer));
    }
    expect(text).not.toContain(CIPHERTEXT);
    expect(text).not.toMatch(/answer/i);
  });
});

describe('races across separate server instances', () => {
  it(
    '10 parallel correct submits give exactly one correct row and one ledger row',
    { timeout: 240_000 },
    async () => {
      await enable('spidey_signal');
      await discover('spidey_signal');
      // Each fresh module graph gets its own connection, like separate serverless instances.
      const list = await Promise.all(
        Array.from({ length: 10 }, async () => {
          vi.resetModules();
          return {
            route: await import('@/app/api/surprises/[kind]/submit/route'),
            client: await import('@/lib/db/client'),
          };
        }),
      );
      try {
        const responses = await Promise.all(
          list.map(({ route }) =>
            route.POST(
              request('/api/surprises/spidey_signal/submit', {
                method: 'POST',
                auth: authA,
                body: { answer: ANSWERS.spidey_signal },
              }),
              params({ kind: 'spidey_signal' }),
            ),
          ),
        );
        const results = await Promise.all(responses.map((res) => res.json()));
        const counts = Object.groupBy(results, (r) => r.result);
        expect(counts.correct).toHaveLength(1);
        expect(counts.already_completed).toHaveLength(9);
        expect(await attempts()).toHaveLength(1);
        expect(await ledger()).toHaveLength(1);
      } finally {
        await Promise.all(list.map(({ client }) => client.db.$client.end()));
      }
    },
  );
});
