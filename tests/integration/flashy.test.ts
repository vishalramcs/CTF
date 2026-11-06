// docs/10: FLASHY SPIDER-MAN, through the real route handlers.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GET as adminGet, PATCH as adminPatch } from '@/app/api/admin/flashy/route';
import { POST as endRoute } from '@/app/api/admin/flashy/end/route';
import { POST as triggerRoute } from '@/app/api/admin/flashy/trigger/route';
import { POST as answerRoute } from '@/app/api/flashy/answer/route';
import { POST as playbackRoute } from '@/app/api/flashy/playback/route';
import { GET as stateRoute } from '@/app/api/flashy/route';
import { POST as skipRoute } from '@/app/api/flashy/skip/route';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { hashFlashyAnswer } from '@/lib/flashy/state';
import { auditActions, call, createAdmin, createTeam, openSql, ok, sessionFor, type Auth } from './admin-helpers';

const CORRECT = '7016';
const SETTINGS = {
  videoUrl: 'https://example.test/flashy.mp4',
  videoSeconds: 70,
  bonusPoints: 25,
  correct: CORRECT,
  wrong: ['7018', '7610', '1076'],
};

let sql: postgres.Sql;
let admin: Auth & { id: string };
let teamA: string;
let teamB: string;
let authA: Auth;
let authB: Auth;

beforeAll(() => {
  sql = openSql();
});
afterAll(async () => {
  await sql.end();
  await db.$client.end();
});
beforeEach(async () => {
  await wipeAppTables(sql);
  admin = await createAdmin(sql, 'boss', 'super_admin');
  teamA = await createTeam(sql, 'teama');
  teamB = await createTeam(sql, 'teamb');
  authA = await sessionFor(sql, 'teama');
  authB = await sessionFor(sql, 'teamb');
});

const configure = (over: object = {}) =>
  call(adminPatch, '/api/admin/flashy', {
    method: 'PATCH',
    auth: admin,
    body: { ...SETTINGS, ...over },
  });
const trigger = () => call(triggerRoute, '/api/admin/flashy/trigger', { method: 'POST', auth: admin });
const end = () => call(endRoute, '/api/admin/flashy/end', { method: 'POST', auth: admin });
const state = async (auth: Auth = authA) => ok(await call(stateRoute, '/api/flashy', { auth }));
const play = (auth: Auth = authA) => call(playbackRoute, '/api/flashy/playback', { method: 'POST', auth });
const skip = (auth: Auth = authA) => call(skipRoute, '/api/flashy/skip', { method: 'POST', auth });
const answer = (optionId: string, auth: Auth = authA) =>
  call(answerRoute, '/api/flashy/answer', { method: 'POST', auth, body: { optionId } });

async function live(over: object = {}) {
  await ok(await configure(over));
  await ok(await trigger());
}
// The server's clock is what unlocks the question, so the test moves a team's last playback back.
const finishVideo = (teamId: string) =>
  sql`UPDATE app.flashy_participation SET last_playback_at = now() - interval '1 hour'
      WHERE team_id = ${teamId}`;
async function watched(auth: Auth, teamId: string) {
  await ok(await play(auth));
  await finishVideo(teamId);
}
async function optionId(label: string, auth: Auth = authA) {
  const s = await state(auth);
  const option = s.options.find((o: { label: string }) => o.label === label);
  expect(option, 'options should be showing').toBeDefined();
  return option.id as string;
}
const ledger = (teamId: string) =>
  sql`SELECT points::float AS points, category FROM app.score_transactions
      WHERE team_id = ${teamId} AND ref_type = 'flashy_run'`;

describe('admin controls', () => {
  it('only an admin can configure, trigger or end', async () => {
    for (const [handler, path, method] of [
      [adminPatch, '/api/admin/flashy', 'PATCH'],
      [triggerRoute, '/api/admin/flashy/trigger', 'POST'],
      [endRoute, '/api/admin/flashy/end', 'POST'],
    ] as const) {
      const asTeam = await call(handler, path, { method, auth: authA, body: SETTINGS });
      expect([401, 403]).toContain(asTeam.status);
      const anon = await call(handler, path, { method, body: SETTINGS });
      expect([401, 403]).toContain(anon.status);
    }
    expect([401, 403]).toContain((await call(adminGet, '/api/admin/flashy', { auth: authA })).status);
    expect((await state()).active).toBe(false);
  });

  it('refuses to trigger until the video, four options and answer are set', async () => {
    const res = await trigger();
    expect(res.status).toBe(409);
    expect((await state()).active).toBe(false);
  });

  it('rejects duplicate or incomplete options', async () => {
    expect((await configure({ wrong: ['7018', '7018', '1076'] })).status).toBe(400);
    expect((await configure({ wrong: ['7018', '1076'] })).status).toBe(400);
    expect((await configure({ videoUrl: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('allows only one live run however many triggers arrive', async () => {
    await ok(await configure());
    const results = await Promise.all(Array.from({ length: 6 }, trigger));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.flashy_runs`;
    expect(n).toBe(1);
  });

  it('ending needs a live run, and the team state goes inactive', async () => {
    expect((await end()).status).toBe(409);
    await live();
    expect((await state()).active).toBe(true);
    await ok(await end());
    expect((await state()).active).toBe(false);
  });

  it('writes the audit log, without the options or the answer', async () => {
    await live();
    await ok(await end());
    const actions = await auditActions(sql);
    expect(actions).toEqual(expect.arrayContaining(['flashy.config', 'flashy.trigger', 'flashy.end']));
    const rows = await sql`SELECT details FROM app.audit_log WHERE action = 'flashy.config'`;
    expect(JSON.stringify(rows)).not.toContain(CORRECT);
  });
});

describe('what a team can see', () => {
  it('hides the options until the video can have finished, and never marks the right one', async () => {
    await live();
    const first = await state();
    expect(first).toMatchObject({ active: true, phase: 'watch', playbacksLeft: 2, options: [] });
    await ok(await play());
    expect((await state()).options).toEqual([]);
    await finishVideo(teamA);
    const quiz = await state();
    expect(quiz.phase).toBe('quiz');
    expect(quiz.options).toHaveLength(4);
    expect(quiz.options.map((o: { label: string }) => o.label).sort()).toEqual(
      [CORRECT, ...SETTINGS.wrong].sort(),
    );
    const text = JSON.stringify(quiz);
    expect(text).not.toContain(hashFlashyAnswer(CORRECT));
    expect(text).not.toMatch(/correct|answer_hash|isCorrect/i);
  });

  it('keeps the correct answer out of the admin view too', async () => {
    await live();
    const text = JSON.stringify(await ok(await call(adminGet, '/api/admin/flashy', { auth: admin })));
    expect(text).not.toContain(hashFlashyAnswer(CORRECT));
    expect(text).not.toMatch(/answer_?hash/i);
  });
});

describe('playback limit', () => {
  it('allows two plays, refuses the third, and a refresh does not reset it', async () => {
    await live();
    const one = await ok(await play());
    expect(one.playbacksLeft).toBe(1);
    expect(one.videoUrl).toBe(SETTINGS.videoUrl);
    const two = await ok(await play());
    expect(two.playbacksLeft).toBe(0);
    const three = await play();
    expect(three.status).toBe(403);
    expect((await state()).playbacksLeft).toBe(0);
    expect((await play()).status).toBe(403);
  });

  it('cannot be raced past two', async () => {
    await live();
    const results = await Promise.all(Array.from({ length: 8 }, () => play()));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    const [row] = await sql`SELECT playbacks FROM app.flashy_participation WHERE team_id = ${teamA}`;
    expect(row.playbacks).toBe(2);
  });

  it('is counted for each team on its own', async () => {
    await live();
    await ok(await play(authA));
    await ok(await play(authA));
    expect((await play(authA)).status).toBe(403);
    expect((await ok(await play(authB))).playbacksLeft).toBe(1);
  });

  it('is refused when no event is live', async () => {
    expect((await play()).status).toBe(409);
  });
});

describe('answering and the bonus', () => {
  it('rejects an answer before the video was played', async () => {
    await live();
    const [anyOption] = (await sql`SELECT options FROM app.flashy_runs`)[0].options;
    expect((await answer(anyOption.id)).status).toBe(409);
    await ok(await play()); // played, but the server clock says it is not over
    expect((await answer(anyOption.id)).status).toBe(409);
    expect(await ledger(teamA)).toHaveLength(0);
  });

  it('pays the configured bonus once through the ledger and onto the leaderboard', async () => {
    await live();
    await watched(authA, teamA);
    const res = await ok(await answer(await optionId(CORRECT)));
    expect(res).toEqual({ result: 'correct' });
    expect(await ledger(teamA)).toEqual([{ points: 25, category: 'surprise' }]);
    const [board] = await sql`SELECT total::float AS total, surprise_points::float AS sp
                              FROM app.v_scoreboard WHERE team_id = ${teamA}`;
    expect(board).toEqual({ total: 25, sp: 25 });
    expect((await state()).phase).toBe('done');
  });

  it('cannot be paid twice by repeating or racing the answer', async () => {
    await live();
    await watched(authA, teamA);
    const id = await optionId(CORRECT);
    const results = await Promise.all(Array.from({ length: 6 }, () => answer(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await answer(id)).status).toBe(409);
    expect(await ledger(teamA)).toHaveLength(1);
  });

  it('gives nothing for a wrong answer, says nothing more, and allows no second try', async () => {
    await live();
    await watched(authA, teamA);
    const wrongId = await optionId('7018');
    const res = await ok(await answer(wrongId));
    expect(res).toEqual({ result: 'wrong' });
    expect(await ledger(teamA)).toHaveLength(0);
    expect((await answer(wrongId)).status).toBe(409);
    const [row] = await sql`SELECT state, is_correct, points_awarded::float AS p
                            FROM app.flashy_participation WHERE team_id = ${teamA}`;
    expect(row).toEqual({ state: 'answered', is_correct: false, p: 0 });
  });

  it('rejects an option that is not on the list', async () => {
    await live();
    await watched(authA, teamA);
    expect((await answer('nope')).status).toBe(400);
  });

  it('a bonus of 0 records the answer and writes no ledger row', async () => {
    await live({ bonusPoints: 0 });
    await watched(authA, teamA);
    await ok(await answer(await optionId(CORRECT)));
    expect(await ledger(teamA)).toHaveLength(0);
  });

  it('uses the bonus from when the event started, not a later edit', async () => {
    await live();
    await ok(await configure({ bonusPoints: 900 }));
    await watched(authA, teamA);
    await ok(await answer(await optionId(CORRECT)));
    expect((await ledger(teamA))[0].points).toBe(25);
  });

  it('teams are independent', async () => {
    await live();
    await watched(authA, teamA);
    await ok(await answer(await optionId(CORRECT, authA), authA));
    expect((await state(authB)).phase).toBe('watch');
    expect(await ledger(teamB)).toHaveLength(0);
  });
});

describe('skip', () => {
  it('awards nothing, persists, and cannot be undone by playing or answering', async () => {
    await live();
    await ok(await skip());
    expect(await ledger(teamA)).toHaveLength(0);
    expect(await state()).toMatchObject({ active: true, phase: 'done', outcome: 'skipped' });
    expect((await play()).status).toBe(409);
    expect((await answer('anything')).status).toBe(409);
    expect((await skip()).status).toBe(409);
    expect((await state(authB)).phase).toBe('watch');
  });

  it('cannot skip after answering', async () => {
    await live();
    await watched(authA, teamA);
    await ok(await answer(await optionId(CORRECT)));
    expect((await skip()).status).toBe(409);
    expect(await ledger(teamA)).toHaveLength(1);
  });
});

describe('ending the event', () => {
  it('refuses answers and pays nothing after it ends', async () => {
    await live();
    await watched(authA, teamA);
    const id = await optionId(CORRECT);
    await ok(await end());
    expect((await answer(id)).status).toBe(409);
    expect((await play(authB)).status).toBe(409);
    expect((await skip(authB)).status).toBe(409);
    expect(await ledger(teamA)).toHaveLength(0);
  });

  it('a new trigger is a new run, and each run pays a team at most once', async () => {
    await live();
    await watched(authA, teamA);
    await ok(await answer(await optionId(CORRECT)));
    await ok(await end());
    await ok(await trigger());
    expect((await state()).phase).toBe('watch');
    const runs = await sql`SELECT id FROM app.flashy_runs`;
    expect(runs).toHaveLength(2);
    expect(await ledger(teamA)).toHaveLength(1);
  });
});
