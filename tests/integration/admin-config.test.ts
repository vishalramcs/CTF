// R7/R9: event controls, challenges, coordinates, surprises, scores, reset and developer access.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as adjust } from '@/app/api/admin/scores/adjust/route';
import { POST as adminLogin } from '@/app/api/auth/admin-login/route';
import { DELETE as announcementDelete } from '@/app/api/admin/announcements/[id]/route';
import {
  GET as announcementsGet,
  POST as announcementsPost,
} from '@/app/api/admin/announcements/route';
import { POST as testFlag } from '@/app/api/admin/challenges/[id]/test-flag/route';
import { POST as regenerate } from '@/app/api/admin/challenges/[id]/regenerate/route';
import { POST as setFlag } from '@/app/api/admin/challenges/[id]/flag/route';
import {
  DELETE as challengeDelete,
  PATCH as challengePatch,
} from '@/app/api/admin/challenges/[id]/route';
import { POST as challengesPost } from '@/app/api/admin/challenges/route';
import { DELETE as developerDelete } from '@/app/api/admin/developers/[id]/route';
import { POST as developersPost } from '@/app/api/admin/developers/route';
import { POST as reset } from '@/app/api/admin/event/reset/route';
import { POST as settings } from '@/app/api/admin/event/settings/route';
import { POST as transition } from '@/app/api/admin/event/transition/route';
import { POST as answerPost } from '@/app/api/admin/coordinates/answer/route';
import { POST as answerReveal } from '@/app/api/admin/coordinates/answer/reveal/route';
import { POST as finalPost } from '@/app/api/admin/coordinates/final/route';
import { POST as fragmentsPost } from '@/app/api/admin/coordinates/fragments/route';
import { POST as resetSolves } from '@/app/api/admin/challenges/[id]/reset-solves/route';
import { POST as surpriseActivate } from '@/app/api/admin/surprises/[kind]/activate/route';
import { POST as surpriseReveal } from '@/app/api/admin/surprises/[kind]/reveal/route';
import { PATCH as surprisePatch } from '@/app/api/admin/surprises/[kind]/route';
import { GET as surprisesGet } from '@/app/api/admin/surprises/route';
import { hmacHex } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { submitCoordinates } from '@/lib/coordinates/submit';
import { discoverSurprise, submitSurprise } from '@/lib/surprises/submit';
import {
  auditActions,
  call,
  createAdmin,
  createChallenge,
  createTeam,
  flagOf,
  ok,
  openSql,
  sessionFor,
  type Auth,
  type TestChallenge,
} from './admin-helpers';

let sql: postgres.Sql;
let admin: Auth & { id: string };
let teamId: string;
let c: Record<number, TestChallenge>;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  admin = await createAdmin(sql, 'root1', 'super_admin');
  teamId = await createTeam(sql, 'teama');
  c = {};
  for (let n = 1; n <= 13; n++) c[n] = await createChallenge(sql, n);
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

// Runs one mutation and checks it left exactly one new audit row with this action.
async function audited<T>(action: string, run: () => Promise<T>): Promise<T> {
  const count = async () => (await auditActions(sql)).filter((a) => a === action).length;
  const before = await count();
  const out = await run();
  expect(await count(), `audit row for ${action}`).toBe(before + 1);
  return out;
}

const post = (handler: Parameters<typeof call>[0], path: string, body?: unknown, ctx = {}) =>
  call(handler, path, { method: 'POST', auth: admin, body, ctx });
const patch = (handler: Parameters<typeof call>[0], path: string, body: unknown, ctx = {}) =>
  call(handler, path, { method: 'PATCH', auth: admin, body, ctx });
const del = (handler: Parameters<typeof call>[0], path: string, body: unknown = {}, ctx = {}) =>
  call(handler, path, { method: 'DELETE', auth: admin, body, ctx });

const status = async () => (await sql`SELECT status FROM app.event_state`)[0].status;
const transit = (action: string) => post(transition, '/api/admin/event/transition', { action });

describe('event controls', () => {
  it('allows only the legal transitions and audits each', async () => {
    const legal: [string, string][] = [
      ['start', 'running'],
      ['pause', 'paused'],
      ['resume', 'running'],
      ['pause', 'paused'],
      ['end', 'ended'],
    ];
    for (const [action, to] of legal) {
      await audited(`event.${action}`, async () => ok(await transit(action)));
      expect(await status()).toBe(to);
    }
    // Ended is final.
    for (const action of ['start', 'pause', 'resume', 'end']) {
      expect((await transit(action)).status, action).toBe(409);
    }
    expect(await status()).toBe('ended');
  });

  it('refuses the moves that do not fit', async () => {
    for (const action of ['pause', 'resume', 'end']) {
      expect((await transit(action)).status, `${action} before start`).toBe(409);
    }
    await ok(await transit('start'));
    expect((await transit('start')).status).toBe(409);
    expect((await transit('resume')).status).toBe(409);
    expect((await post(transition, '/api/admin/x', { action: 'rewind' })).status).toBe(400);
    expect(await status()).toBe('running');
  });

  it('freezing stores a snapshot of the public board in the same step', async () => {
    const freeze = (leaderboardFrozen: boolean) =>
      post(settings, '/api/admin/event/settings', { leaderboardFrozen });
    await audited('event.settings', async () => ok(await freeze(true)));
    expect(await sql`SELECT snapshot FROM app.scoreboard_snapshots`).toHaveLength(1);
    const [{ snapshot }] = await sql`SELECT snapshot FROM app.scoreboard_snapshots`;
    expect(snapshot.map((r: { teamName: string }) => r.teamName)).toEqual(['Team teama']);
    expect(snapshot[0]).not.toHaveProperty('team_id');

    await ok(await freeze(true)); // already frozen: no second snapshot
    expect(await sql`SELECT 1 FROM app.scoreboard_snapshots`).toHaveLength(1);
    await ok(await freeze(false));
    expect((await sql`SELECT leaderboard_frozen AS f FROM app.event_state`)[0].f).toBe(false);
    expect((await sql`SELECT coordinate_winner_id AS w FROM app.event_state`)[0].w).toBeNull();

    await audited('event.settings', async () =>
      ok(await post(settings, '/api/admin/event/settings', { submissionsOpen: false })),
    );
    expect((await sql`SELECT submissions_open AS s FROM app.event_state`)[0].s).toBe(false);
  });
});

describe('challenges', () => {
  const fields = (number: number, extra = {}) => ({
    number,
    title: 'Fresh challenge',
    difficulty: 'easy',
    category: 'osint',
    basePoints: 60,
    storyMd: 'A story.',
    questionTemplate: '<p>{{flag|base64}}</p>',
    evidence: [],
    generatorKey: 'template',
    generatorConfig: {},
    hints: ['Look closer'],
    isPublished: false,
    ...extra,
  });

  it('creates, edits, flags, tests, regenerates and deletes', async () => {
    await sql`DELETE FROM app.challenges WHERE number = 1`;
    const created = await audited('challenge.create', async () =>
      ok(
        await post(challengesPost, '/api/admin/challenges', {
          fields: fields(1),
          flagTemplate: '{{token}}',
        }),
        201,
      ),
    );
    const ctx = { id: created.id };
    const version = async () =>
      (await sql`SELECT generator_version AS v FROM app.challenges WHERE id = ${created.id}`)[0].v;
    expect(await version()).toBe(1);
    expect(
      await sql`SELECT 1 FROM app.challenge_hints WHERE challenge_id = ${created.id}`,
    ).toHaveLength(1);

    // Publishing does not touch the variants, a new template does.
    await audited('challenge.update', async () =>
      ok(await patch(challengePatch, '/api/admin/x', { isPublished: true }, ctx)),
    );
    expect(await version()).toBe(1);
    await ok(
      await patch(
        challengePatch,
        '/api/admin/x',
        { questionTemplate: '<p>{{flag|base64}} again</p>' },
        ctx,
      ),
    );
    expect(await version()).toBe(2);

    const regenerated = await audited('challenge.regenerate_variants', async () =>
      ok(await post(regenerate, '/api/admin/x', {}, ctx)),
    );
    expect(regenerated.regenerated).toBe(1);

    const challenge: TestChallenge = {
      id: created.id,
      number: 1,
      fragment: null,
      flagTemplate: '{{token}}',
    };
    const test = async (flag: string) =>
      (
        await ok(
          await audited('challenge.test_flag', async () =>
            post(testFlag, '/api/admin/x', { teamId, flag }, ctx),
          ),
        )
      ).match;
    expect(await test(flagOf(teamId, challenge))).toBe(true);
    expect(await test('SPIDEY{nope}')).toBe(false);

    // A static flag is stored hashed and never returned.
    const flag = `${env.FLAG_PREFIX}{shared-secret}`;
    const set = await audited('challenge.set_flag', async () =>
      post(setFlag, '/api/admin/x', { mode: 'static', flag }, ctx),
    );
    expect(await set.text()).not.toContain('shared-secret');
    const [row] =
      await sql`SELECT flag_mode, static_flag_hash FROM app.challenges WHERE id = ${created.id}`;
    expect(row.flag_mode).toBe('static');
    expect(row.static_flag_hash).toHaveLength(64);
    expect(
      (await post(setFlag, '/api/admin/x', { mode: 'team', template: 'no-token' }, ctx)).status,
    ).toBe(400);

    await audited('challenge.delete', async () =>
      ok(await del(challengeDelete, '/api/admin/x', {}, ctx)),
    );
    expect(await version().catch(() => 'gone')).toBe('gone');
  });

  it('validates the form and keeps solved challenges', async () => {
    const create = (f: object, flagTemplate = '{{token}}') =>
      post(challengesPost, '/api/admin/challenges', { fields: f, flagTemplate });
    expect((await create(fields(14))).status).toBe(400);
    expect((await create(fields(0))).status).toBe(400);
    expect((await create(fields(2, { title: '' }))).status).toBe(400);
    expect((await create(fields(2), 'plain')).status).toBe(400);
    expect((await create(fields(2))).status).toBe(409); // number 2 exists

    await sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${teamId}, ${c[3].id})`;
    expect((await del(challengeDelete, '/api/admin/x', {}, { id: c[3].id })).status).toBe(409);
  });
});

// Placeholder plan: 2 Easy, 2 Medium, 2 Difficult, orders 1-6. Swap reorders within each pair.
const PLAN = (swap = false) =>
  [1, 2, 5, 6, 9, 10].map((n, i) => ({
    challengeId: c[n].id,
    value: `VALUE${n}`,
    order: swap ? (i ^ 1) + 1 : i + 1,
    orderClue: `Clue ${n}`,
  }));
const FINAL = [
  { label: 'A', value: '11' },
  { label: 'B', value: '22' },
  { label: 'C', value: '33' },
];

describe('coordinates and fragments', () => {
  const save = (plan: unknown) => post(fragmentsPost, '/api/admin/x', { plan });

  it('accepts exactly 2/2/2 with orders 1-6 once each, and regenerates variants', async () => {
    await audited('fragments.save', async () => ok(await save(PLAN())));
    const version = async (n: number) =>
      (await sql`SELECT generator_version AS v FROM app.challenges WHERE id = ${c[n].id}`)[0].v;
    expect(await version(1)).toBe(2);
    expect(await version(3)).toBe(1);
    const rows = await sql`SELECT number, fragment_value, coordinate_order FROM app.challenges
      WHERE fragment_value IS NOT NULL ORDER BY coordinate_order`;
    expect(rows.map((r) => r.number)).toEqual([1, 2, 5, 6, 9, 10]);
    // Reordering in one save works, and the log never carries values.
    await ok(await save(PLAN(true)));
    const log =
      await sql`SELECT details::text AS d FROM app.audit_log WHERE action = 'fragments.save'`;
    expect(log.map((l) => l.d).join()).not.toMatch(/VALUE/);
  });

  it('refuses every plan that is not 2 Easy, 2 Medium, 2 Difficult with unique orders', async () => {
    const plan = PLAN();
    const bad: [string, unknown][] = [
      ['five', plan.slice(0, 5)],
      ['three easy', [{ ...plan[2], challengeId: c[3].id }, ...plan.filter((_, i) => i !== 2)]],
      ['duplicate order', plan.map((p, i) => (i === 1 ? { ...p, order: 1 } : p))],
      ['order 7', plan.map((p, i) => (i === 1 ? { ...p, order: 7 } : p))],
      ['the Main Question', [...plan.slice(0, 5), { ...plan[5], challengeId: c[13].id }]],
      ['a repeated question', plan.map((p, i) => (i === 1 ? { ...p, challengeId: c[1].id } : p))],
    ];
    for (const [name, body] of bad) {
      expect((await save(body)).status, name).toBe(400);
    }
    expect(await sql`SELECT 1 FROM app.challenges WHERE fragment_value IS NOT NULL`).toHaveLength(
      0,
    );
    await ok(await save(plan));
    await ok(await save([])); // clears
    expect(await sql`SELECT 1 FROM app.challenges WHERE fragment_value IS NOT NULL`).toHaveLength(
      0,
    );
  });

  it('stores three final coordinates and refuses any other count', async () => {
    expect((await post(finalPost, '/api/admin/x', { coordinates: FINAL.slice(0, 2) })).status).toBe(
      400,
    );
    await audited('final_coordinates.save', async () =>
      ok(await post(finalPost, '/api/admin/x', { coordinates: FINAL })),
    );
    expect(await sql`SELECT value FROM app.final_coordinates ORDER BY position`).toEqual([
      { value: '11' },
      { value: '22' },
      { value: '33' },
    ]);
    const log =
      await sql`SELECT details::text AS d FROM app.audit_log WHERE action = 'final_coordinates.save'`;
    expect(log[0].d).not.toMatch(/11|22|33/);
  });

  it('a saved final answer is hashed, encrypted, viewable on request, and works for a team', async () => {
    expect((await post(answerPost, '/api/admin/x', { answer: '!!!' })).status).toBe(400);
    await audited('final_answer.save', async () =>
      ok(await post(answerPost, '/api/admin/x', { answer: 'Zyxwopolis' })),
    );
    const [row] = await sql`SELECT coordinate_answer_hash AS h, coordinate_answer_enc AS e
      FROM app.event_state`;
    expect(row.h).toBe(hmacHex(env.COORD_HMAC_KEY, 'zyxwopolis'));
    expect(row.e).not.toContain('Zyxwopolis');
    const log =
      await sql`SELECT details::text AS d FROM app.audit_log WHERE action = 'final_answer.save'`;
    expect(log[0].d).not.toMatch(/Zyxwopolis/i);

    const shown = await audited('final_answer.reveal', async () =>
      ok(await post(answerReveal, '/api/admin/x', {})),
    );
    expect(shown.answer).toBe('Zyxwopolis');

    await ok(await transit('start'));
    expect(await submitCoordinates(teamId, '  ZYXWOPOLIS ')).toEqual({
      result: 'correct',
      winner: true,
    });
  });

  it('resets one question only, deleting its solves and ledger rows in one audited action', async () => {
    const other = await createTeam(sql, 'teamb');
    for (const [team, n] of [
      [teamId, 1],
      [other, 1],
      [teamId, 2],
    ] as const) {
      await sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${team}, ${c[n].id})`;
    }
    expect(await sql`SELECT 1 FROM app.score_transactions`).toHaveLength(3);
    const ctx = { id: c[1].id };
    expect((await post(resetSolves, '/api/admin/x', {}, ctx)).status).toBe(400);
    const done = await audited('challenge.reset_solves', async () =>
      ok(await post(resetSolves, '/api/admin/x', { confirm: 'RESET' }, ctx)),
    );
    expect(done.removed).toBe(2);
    const left =
      await sql`SELECT c.number FROM app.solves s JOIN app.challenges c ON c.id = s.challenge_id`;
    expect(left).toEqual([{ number: 2 }]);
    expect(await sql`SELECT 1 FROM app.score_transactions`).toHaveLength(1);
    // The next solver is position 1 again.
    await sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${other}, ${c[1].id})`;
    expect(
      (await sql`SELECT solve_position FROM app.solves WHERE challenge_id = ${c[1].id}`)[0]
        .solve_position,
    ).toBe(1);
  });

  it('freezes at a finale time set by an admin, and an unfreeze clears it', async () => {
    await ok(await post(settings, '/api/admin/x', { freezeAt: '2030-01-01T10:00:00' }));
    const [{ at }] = await sql`SELECT freeze_at AS at FROM app.event_state`;
    expect(at).not.toBeNull();
    expect((await post(settings, '/api/admin/x', { freezeAt: 'soon' })).status).toBe(400);
    await ok(await post(settings, '/api/admin/x', { leaderboardFrozen: true }));
    await ok(await post(settings, '/api/admin/x', { leaderboardFrozen: false }));
    expect((await sql`SELECT freeze_at AS at FROM app.event_state`)[0].at).toBeNull();
  });
});

describe('surprises', () => {
  const ctx = { kind: 'spidey_signal' };
  const edit = (body: unknown, kind = 'spidey_signal') =>
    patch(surprisePatch, '/api/admin/x', body, { kind });

  it('validates asset URLs, the answer, the window and the event status', async () => {
    for (const assetUrl of [
      'javascript:alert(1)',
      'http://example.com/a.mp4',
      '//evil.test/a',
      'data:text/html,x',
    ]) {
      expect((await edit({ assetUrl })).status, assetUrl).toBe(400);
    }
    await ok(await edit({ assetUrl: 'https://example.com/a.mp4' }));
    await ok(await edit({ assetUrl: '/videos/a.mp4' }));
    expect((await edit({ answer: '   ' })).status).toBe(400);

    const enable = await edit({ enabled: true }); // no answer yet
    expect(enable.status).toBe(409);
    expect((await enable.json()).error.code).toBe('no_answer');
    await ok(await edit({ answer: 'Web Weaver' }));

    const early = await edit({ enabled: true }); // event not started, no start time
    expect(early.status).toBe(409);
    expect((await early.json()).error.code).toBe('not_started');
    expect(
      (
        await edit({
          enabled: true,
          availableFrom: '2030-01-02T00:00:00Z',
          availableUntil: '2030-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(400);
    await ok(await edit({ enabled: true, availableFrom: '2030-01-01T00:00:00Z' }));
    expect(
      (await sql`SELECT enabled FROM app.surprise_events WHERE kind = 'spidey_signal'`)[0].enabled,
    ).toBe(true);
    expect((await edit({ title: 'x' }, 'unknown')).status).toBe(404);
  });

  it('a saved answer works through submitSurprise, and activate opens the window now', async () => {
    await audited('surprise.update', async () =>
      ok(await edit({ title: 'Signal', contentHtml: '<p>Find it</p>', answer: 'Web Weaver' })),
    );
    const [row] =
      await sql`SELECT answer_hash, answer_enc FROM app.surprise_events WHERE kind = 'spidey_signal'`;
    expect(row.answer_enc).not.toContain('Web Weaver');
    const log =
      await sql`SELECT details::text AS d FROM app.audit_log WHERE action = 'surprise.update'`;
    expect(log[0].d).not.toMatch(/Weaver|Find it/);

    await ok(await transit('start'));
    await audited('surprise.activate', async () =>
      ok(await post(surpriseActivate, '/api/admin/x', {}, ctx)),
    );
    expect(
      (await post(surpriseActivate, '/api/admin/x', {}, { kind: 'flashy_spider' })).status,
    ).toBe(409); // no answer there
    const shown = await audited('surprise.reveal_answer', async () =>
      ok(await post(surpriseReveal, '/api/admin/x', {}, ctx)),
    );
    expect(shown.answer).toBe('Web Weaver');

    expect((await discoverSurprise(teamId, 'spidey_signal')).result).toBe('ok');
    expect(await submitSurprise(teamId, 'spidey_signal', '  web   WEAVER ')).toEqual({
      result: 'correct',
      points: 30,
    });

    const { surprises } = await ok(
      await call(surprisesGet, '/api/admin/surprises', { auth: admin }),
    );
    const signal = surprises.find((s: { kind: string }) => s.kind === 'spidey_signal');
    expect(signal).toMatchObject({ completions: 1, points: 30, hasAnswer: true, enabled: true });
    expect(signal.teams).toEqual([expect.objectContaining({ team: 'Team teama' })]);
  });
});

describe('scores', () => {
  it('an adjustment is a ledger row and shows in v_scoreboard', async () => {
    const give = (points: number, reason = 'Judge call') =>
      post(adjust, '/api/admin/scores/adjust', { teamId, points, reason });
    await audited('score.adjust', async () => ok(await give(25.5), 201));
    await ok(await give(-5), 201);
    const [board] = await sql`SELECT total::text, adjustment_points::text FROM app.v_scoreboard`;
    expect(board).toEqual({ total: '20.50', adjustment_points: '20.50' });
    const [ledger] =
      await sql`SELECT category, admin_id, reason FROM app.score_transactions ORDER BY id LIMIT 1`;
    expect(ledger).toEqual({ category: 'adjustment', admin_id: admin.id, reason: 'Judge call' });

    for (const [points, reason] of [
      [0, 'Zero'],
      [1.25, 'Too fine'],
      [5, 'ab'],
      [20_000, 'Huge'],
    ] as const) {
      expect((await give(points, reason)).status, `${points} ${reason}`).toBe(400);
    }
    const missing = await post(adjust, '/api/admin/scores/adjust', {
      teamId: '00000000-0000-4000-8000-000000000000',
      points: 5,
      reason: 'Nobody',
    });
    expect(missing.status).toBe(404);
  });
});

describe('announcements', () => {
  it('creates and removes', async () => {
    const created = await audited('announcement.create', async () =>
      ok(await post(announcementsPost, '/api/admin/announcements', { message: 'Lunch at 1' }), 201),
    );
    const list = await ok(
      await call(announcementsGet, '/api/admin/announcements', { auth: admin }),
    );
    expect(list.announcements.map((a: { message: string }) => a.message)).toEqual(['Lunch at 1']);
    expect((await post(announcementsPost, '/api/admin/x', { message: '  ' })).status).toBe(400);
    await audited('announcement.delete', async () =>
      ok(await del(announcementDelete, '/api/admin/x', {}, { id: created.id })),
    );
    expect(await sql`SELECT 1 FROM app.announcements`).toHaveLength(0);
    expect((await del(announcementDelete, '/api/admin/x', {}, { id: created.id })).status).toBe(
      404,
    );
  });
});

describe('developer access', () => {
  it('adds a developer who can log in, and removes them; nobody removes themselves', async () => {
    const add = (username: string, password: string) =>
      post(developersPost, '/api/admin/developers', { username, password });
    const created = await audited('developer.add', async () =>
      ok(await add('dev.one', 'long-enough-pass'), 201),
    );
    expect((await add('DEV.ONE', 'long-enough-pass')).status).toBe(409);
    expect((await add('dev.two', 'short')).status).toBe(400);

    const loggedIn = await call(adminLogin, '/api/auth/admin-login', {
      method: 'POST',
      body: { username: 'dev.one', password: 'long-enough-pass' },
    });
    expect(loggedIn.status).toBe(200);
    const [stored] =
      await sql`SELECT password_hash, admin_level FROM app.users WHERE username = 'dev.one'`;
    expect(stored.password_hash).toMatch(/^\$argon2id\$/);
    expect(stored.admin_level).toBe('developer');

    const own = await del(developerDelete, '/api/admin/x', {}, { id: admin.id });
    expect(own.status).toBe(400);
    const devAuth = await sessionFor(sql, 'dev.one');
    await audited('developer.remove', async () =>
      ok(await del(developerDelete, '/api/admin/x', {}, { id: created.id })),
    );
    const afterRemoval = await call(announcementsGet, '/api/admin/announcements', {
      auth: devAuth,
    });
    expect(afterRemoval.status).toBe(401);
    expect((await del(developerDelete, '/api/admin/x', {}, { id: created.id })).status).toBe(404);
  });
});

describe('reset test data', () => {
  it('needs the word RESET, clears progress, keeps configuration, and audits', async () => {
    // Configuration that must survive.
    await ok(await post(fragmentsPost, '/api/admin/x', { plan: PLAN() }));
    await ok(await post(finalPost, '/api/admin/x', { coordinates: FINAL }));
    await ok(await post(answerPost, '/api/admin/x', { answer: 'Zyxwopolis' }));
    await ok(
      await patch(
        surprisePatch,
        '/api/admin/x',
        { title: 'Kept', answer: 'kept' },
        { kind: 'spidey_signal' },
      ),
    );
    await ok(await post(announcementsPost, '/api/admin/x', { message: 'Kept' }), 201);
    await ok(await transit('start'));
    await ok(await post(settings, '/api/admin/x', { leaderboardFrozen: true }));

    // Progress that must go.
    await sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${teamId}, ${c[1].id})`;
    await sql`INSERT INTO app.submissions (team_id, challenge_id, submitted_hash, is_correct, result)
      VALUES (${teamId}, ${c[1].id}, 'h', false, 'wrong')`;
    await sql`INSERT INTO app.coordinate_submissions (team_id, submitted_hash, is_correct)
      VALUES (${teamId}, 'h', true)`;
    await sql`UPDATE app.event_state SET coordinate_winner_id = ${teamId}, coordinate_won_at = now()`;
    await sql`INSERT INTO app.surprise_progress (team_id, event_id, completed_at)
      SELECT ${teamId}, id, now() FROM app.surprise_events WHERE kind = 'spidey_signal'`;
    await sql`INSERT INTO app.surprise_submissions (event_id, team_id, submitted_hash, is_correct)
      SELECT id, ${teamId}, 'h', true FROM app.surprise_events WHERE kind = 'spidey_signal'`;
    await sql`INSERT INTO app.hint_reveals (team_id, challenge_id, hint_order) VALUES (${teamId}, ${c[1].id}, 1)`;
    await ok(await post(adjust, '/api/admin/x', { teamId, points: 5, reason: 'Test' }), 201);

    expect((await post(reset, '/api/admin/event/reset', { confirm: 'reset' })).status).toBe(400);
    expect((await post(reset, '/api/admin/event/reset', {})).status).toBe(400);
    await audited('event.reset', async () =>
      ok(await post(reset, '/api/admin/event/reset', { confirm: 'RESET' })),
    );

    for (const table of [
      'solves',
      'submissions',
      'score_transactions',
      'coordinate_submissions',
      'surprise_progress',
      'surprise_submissions',
      'hint_reveals',
      'scoreboard_snapshots',
    ]) {
      expect(await sql`SELECT 1 FROM ${sql('app.' + table)}`, table).toHaveLength(0);
    }
    expect(await status()).toBe('not_started');
    expect((await sql`SELECT leaderboard_frozen AS f FROM app.event_state`)[0].f).toBe(false);
    expect((await sql`SELECT coordinate_winner_id AS w FROM app.event_state`)[0].w).toBeNull();

    expect(await sql`SELECT 1 FROM app.teams`).toHaveLength(1);
    expect(await sql`SELECT 1 FROM app.challenges`).toHaveLength(13);
    expect(await sql`SELECT 1 FROM app.challenges WHERE fragment_value IS NOT NULL`).toHaveLength(
      6,
    );
    expect(await sql`SELECT 1 FROM app.final_coordinates`).toHaveLength(3);
    expect(
      (await sql`SELECT coordinate_answer_hash AS h FROM app.event_state`)[0].h,
    ).not.toBeNull();
    expect(
      (
        await sql`SELECT title, answer_hash FROM app.surprise_events WHERE kind = 'spidey_signal'`
      )[0],
    ).toMatchObject({ title: 'Kept' });
    expect(await sql`SELECT 1 FROM app.announcements`).toHaveLength(1);
    expect((await sql`SELECT total::text FROM app.v_scoreboard`)[0].total).toBe('0.00');
  });
});
