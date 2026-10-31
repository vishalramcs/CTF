// R7 writes the freeze snapshot and R8 serves it, so this goes through both real routes.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as settings } from '@/app/api/admin/event/settings/route';
import { GET as state } from '@/app/api/public/state/route';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import {
  createAdminSession,
  createTeam,
  openSql,
  params,
  request,
  setStatus,
} from './challenge-helpers';

let sql: postgres.Sql;

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  await setStatus(sql, 'running');
});

afterAll(async () => {
  await sql.end();
  await db.$client.end();
});

function score(teamId: string, points: number) {
  return sql`
    INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
    VALUES (${teamId}, 'challenge', ${points}, 'solve', gen_random_uuid())`;
}

async function board() {
  const res = await state();
  return (await res.json()).leaderboard;
}

describe('leaderboard freeze', () => {
  it('serves the board exactly as it was when frozen, in the same shape as the live board', async () => {
    const admin = await createAdminSession(sql);
    const a = await createTeam(sql, 'teama');
    const b = await createTeam(sql, 'teamb');
    await score(a, 59.5);
    await score(b, 60);
    const live = await board();
    expect(live[0]).toMatchObject({ rank: 1, teamName: 'Team teamb', total: 60 });

    const freeze = (leaderboardFrozen: boolean) =>
      settings(
        request('/api/admin/event/settings', {
          method: 'POST',
          auth: admin,
          body: { leaderboardFrozen },
        }),
        params({}),
      );
    expect((await freeze(true)).status).toBe(200);
    expect(await board()).toEqual(live);

    await score(a, 100);
    expect(await board()).toEqual(live);

    expect((await freeze(false)).status).toBe(200);
    expect((await board())[0]).toMatchObject({ rank: 1, teamName: 'Team teama', total: 159.5 });
  });
});
