// Reproduces docs/05-Backend-Schema.md §7. Wipes the app tables, so re-run `pnpm seed` afterwards.
import { is } from 'drizzle-orm';
import { getTableConfig, getViewConfig, PgTable, PgView } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@/lib/db/schema';
import { isWipeable, wipeAppTables } from '@/lib/db/wipe';

let sql: postgres.Sql;

beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set: fill in .env.local (see README)');
  if (!isWipeable(url, process.env.WIPEABLE_DB_REF)) {
    throw new Error('Refusing to wipe this database: set WIPEABLE_DB_REF to the dev project ref');
  }
  // Same pooler and settings as production, with room for the race tests.
  sql = postgres(url, { prepare: false, max: 30, onnotice: () => {} });
});

beforeEach(() => wipeAppTables(sql));
afterAll(() => sql.end());

async function createTeam(name: string, isHidden = false): Promise<string> {
  const slug = name.toLowerCase().replaceAll(' ', '-');
  const [row] = await sql`
    INSERT INTO app.teams (name, slug, is_hidden) VALUES (${name}, ${slug}, ${isHidden})
    RETURNING id`;
  return row.id;
}

async function createAdmin(): Promise<string> {
  const [row] = await sql`
    INSERT INTO app.users (username, password_hash, role) VALUES ('admin', 'x', 'admin')
    RETURNING id`;
  return row.id;
}

function insertChallenge(
  number: number,
  overrides: Record<string, string | boolean | number | null> = {},
) {
  const isPractice = number === 0;
  const row = {
    number,
    slug: `c${number}`,
    title: `Challenge ${number}`,
    difficulty: 'easy',
    category: 'test',
    is_practice: isPractice,
    base_points: isPractice ? 0 : 100,
    ai_points: isPractice ? 0 : 50,
    flag_mode: 'team',
    flag_template: '{{token}}',
    ...overrides,
  };
  return sql`INSERT INTO app.challenges ${sql(row)} RETURNING id`;
}

async function createChallenge(number: number): Promise<string> {
  const [row] = await insertChallenge(number);
  return row.id;
}

function insertSolve(teamId: string, challengeId: string, points: number, phase: string) {
  return sql`
    INSERT INTO app.solves (team_id, challenge_id, points_awarded, phase)
    VALUES (${teamId}, ${challengeId}, ${points}, ${phase}::app.event_phase)`;
}

describe('structure', () => {
  it('has 26 tables and 3 views, all with RLS on', async () => {
    const [{ tables }] = await sql`
      SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname = 'app'`;
    const [{ views }] = await sql`
      SELECT count(*)::int AS views FROM pg_views WHERE schemaname = 'app'`;
    const [{ open }] = await sql`
      SELECT count(*)::int AS open FROM pg_tables WHERE schemaname = 'app' AND NOT rowsecurity`;
    expect({ tables, views, open }).toEqual({ tables: 26, views: 3, open: 0 });
  });

  it('Drizzle schema matches every table and view column in the database', async () => {
    const rows = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
      SELECT table_name, column_name, is_nullable
        FROM information_schema.columns WHERE table_schema = 'app'`;
    const actual = (table: string) =>
      rows
        .filter((r) => r.table_name === table)
        .map((r) => r.column_name)
        .sort();

    const objects = Object.values(schema);
    const tables = objects.filter((o) => is(o, PgTable)) as PgTable[];
    const views = objects.filter((o) => is(o, PgView)) as PgView[];
    expect(tables).toHaveLength(26);
    expect(views).toHaveLength(3);

    for (const table of tables) {
      const { name, columns } = getTableConfig(table);
      expect(columns.map((c) => c.name).sort(), name).toEqual(actual(name));
      for (const column of columns) {
        const row = rows.find((r) => r.table_name === name && r.column_name === column.name);
        expect(column.notNull, `${name}.${column.name}`).toBe(row?.is_nullable === 'NO');
      }
    }
    for (const view of views) {
      const { name, selectedFields } = getViewConfig(view);
      const fields = Object.values(selectedFields) as { name: string }[];
      expect(fields.map((f) => f.name).sort(), name).toEqual(actual(name));
    }
  });

  it('creates both storage buckets', async () => {
    const rows = await sql`
      SELECT id, public FROM storage.buckets
       WHERE id IN ('challenge-assets', 'private-assets') ORDER BY id`;
    expect(rows).toEqual([
      { id: 'challenge-assets', public: true },
      { id: 'private-assets', public: false },
    ]);
  });
});

describe('client roles', () => {
  it.each(['anon', 'authenticated'])('%s cannot reach schema app', async (role) => {
    const attempt = sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      await tx`SELECT * FROM app.teams`;
    });
    await expect(attempt).rejects.toThrow(/permission denied for schema app/);
  });
});

describe('scoreboard', () => {
  it('sums every source, excludes practice from solves, hides hidden teams', async () => {
    const admin = await createAdmin();
    const practice = await createChallenge(0);
    const c1 = await createChallenge(1);
    const c2 = await createChallenge(2);
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    const hidden = await createTeam('Team Hidden', true);

    await insertSolve(a, c1, 100, 'main_ctf');
    await insertSolve(a, practice, 0, 'onboarding');
    await insertSolve(a, c2, 100, 'ai_mode');
    await sql`
      INSERT INTO app.score_adjustments (team_id, points, reason, admin_id)
      VALUES (${a}, -20, 'test penalty', ${admin})`;
    await sql`
      INSERT INTO app.winners (team_id, winner_type, bonus_points)
      VALUES (${a}, 'coordinates', 300)`;

    await insertSolve(b, c1, 100, 'main_ctf');
    const [surprise] = await sql`
      INSERT INTO app.surprise_events (type, title, answer_hash)
      VALUES ('flash_spidey', 'Flash', 'h') RETURNING id`;
    await sql`
      INSERT INTO app.surprise_submissions (event_id, team_id, submitted_hash, is_correct, points_awarded)
      VALUES (${surprise.id}, ${b}, 'h', true, 50)`;
    await sql`
      INSERT INTO app.spider_signal_codes (team_id, code_hash, expires_at, redeemed_at, points_awarded)
      VALUES (${b}, 'h', now(), now(), 50)`;
    const [morse] = await sql`
      INSERT INTO app.morse_transmissions (digits_hash, digits_enc, digit_count)
      VALUES ('h', 'e', 3) RETURNING id`;
    await sql`
      INSERT INTO app.morse_submissions (transmission_id, team_id, submitted_hash, is_correct, points_awarded)
      VALUES (${morse.id}, ${b}, 'h', true, 100)`;

    await insertSolve(hidden, c1, 100, 'main_ctf');
    await insertSolve(hidden, c2, 500, 'main_ctf');

    const board = await sql`
      SELECT team_name, total, challenge_points, bonus_points, adjustment_points, winner_points,
             solves, rank_all
        FROM app.v_scoreboard ORDER BY rank_all`;
    expect(board).toEqual([
      {
        team_name: 'Team Hidden',
        total: 600,
        challenge_points: 600,
        bonus_points: 0,
        adjustment_points: 0,
        winner_points: 0,
        solves: 2,
        rank_all: 1,
      },
      {
        team_name: 'Team A',
        total: 480,
        challenge_points: 200,
        bonus_points: 0,
        adjustment_points: -20,
        winner_points: 300,
        solves: 2,
        rank_all: 2,
      },
      {
        team_name: 'Team B',
        total: 300,
        challenge_points: 100,
        bonus_points: 200,
        adjustment_points: 0,
        winner_points: 0,
        solves: 1,
        rank_all: 3,
      },
    ]);

    const publicBoard = await sql`
      SELECT rank, team_name, total FROM app.v_public_scoreboard ORDER BY rank`;
    expect(publicBoard).toEqual([
      { rank: 1, team_name: 'Team A', total: 480 },
      { rank: 2, team_name: 'Team B', total: 300 },
    ]);

    const feed = await sql`SELECT team_name, challenge_number FROM app.v_public_feed`;
    expect(feed.map((f) => f.team_name).sort()).toEqual(['Team A', 'Team A', 'Team B']);
    expect(feed.every((f) => f.challenge_number !== 0)).toBe(true);
  });

  it('breaks ties by whoever reached the score first, then by name', async () => {
    const c1 = await createChallenge(1);
    const late = await createTeam('A Late');
    const early = await createTeam('Z Early');
    await createTeam('No Score B');
    await createTeam('No Score A');
    await sql`
      INSERT INTO app.solves (team_id, challenge_id, points_awarded, phase, solved_at)
      VALUES (${late}, ${c1}, 100, 'main_ctf', now()),
             (${early}, ${c1}, 100, 'main_ctf', now() - interval '1 minute')`;

    const board = await sql`SELECT team_name FROM app.v_public_scoreboard ORDER BY rank`;
    expect(board.map((r) => r.team_name)).toEqual([
      'Z Early',
      'A Late',
      'No Score A',
      'No Score B',
    ]);
  });
});

describe('constraints', () => {
  it.each([
    ['team mode without a template', { flag_template: null }, 'challenges_flag_mode_shape'],
    ['template without {{token}}', { flag_template: 'abc' }, 'challenges_template_has_token'],
    [
      'static mode without a hash',
      { flag_mode: 'static', flag_template: null },
      'challenges_flag_mode_shape',
    ],
    [
      'static mode with both',
      { flag_mode: 'static', static_flag_hash: 'h' },
      'challenges_flag_mode_shape',
    ],
    [
      '1-digit fragment',
      { has_fragment: true, fragment_value: '7', coordinate_order: 1 },
      'challenges_fragment_digits',
    ],
    ['fragment without a value', { has_fragment: true }, 'challenges_fragment_shape'],
  ])('rejects %s', async (_name, overrides, constraint) => {
    await expect(insertChallenge(1, overrides)).rejects.toThrow(constraint);
  });

  it('rejects a duplicate coordinate order', async () => {
    const fragment = { has_fragment: true, fragment_value: '11', coordinate_order: 1 };
    await insertChallenge(1, fragment);
    await expect(insertChallenge(2, fragment)).rejects.toThrow('challenges_coordinate_order_uq');
  });

  it('rejects a duplicate solve', async () => {
    const team = await createTeam('Team A');
    const challenge = await createChallenge(1);
    await insertSolve(team, challenge, 100, 'main_ctf');
    await expect(insertSolve(team, challenge, 100, 'main_ctf')).rejects.toThrow(
      'solves_team_id_challenge_id_key',
    );
  });

  it('rejects a finale-phase solve', async () => {
    const team = await createTeam('Team A');
    const challenge = await createChallenge(1);
    await expect(insertSolve(team, challenge, 100, 'finale')).rejects.toThrow('solves_phase_check');
  });

  it('rejects a second winner', async () => {
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    await sql`INSERT INTO app.winners (team_id, winner_type) VALUES (${a}, 'coordinates')`;
    await expect(
      sql`INSERT INTO app.winners (team_id, winner_type) VALUES (${b}, 'coordinates')`,
    ).rejects.toThrow('winners_winner_type_key');
  });

  it('rejects two correct coordinate rows', async () => {
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    const insert = (team: string) => sql`
      INSERT INTO app.coordinate_submissions (team_id, submitted_hash, is_correct)
      VALUES (${team}, 'h', true)`;
    await insert(a);
    await expect(insert(b)).rejects.toThrow('coord_sub_single_winner_uq');
  });

  it('rejects a second event_state row', async () => {
    await expect(sql`INSERT INTO app.event_state (id) VALUES (2)`).rejects.toThrow(
      'event_state_id_check',
    );
  });

  it('rejects coordinates locked without a winner', async () => {
    await expect(sql`UPDATE app.event_state SET coordinates_locked = true`).rejects.toThrow(
      'event_winner_consistency',
    );
  });

  it('rejects a blank adjustment reason', async () => {
    const admin = await createAdmin();
    const team = await createTeam('Team A');
    await expect(
      sql`
        INSERT INTO app.score_adjustments (team_id, points, reason, admin_id)
        VALUES (${team}, 10, '   ', ${admin})`,
    ).rejects.toThrow('score_adjustments_reason_check');
  });
});

describe('broadcast gate', () => {
  it('opens once per window', async () => {
    const [first] = await sql`SELECT app.try_open_gate('board') AS open`;
    const [second] = await sql`SELECT app.try_open_gate('board') AS open`;
    expect([first.open, second.open]).toEqual([true, false]);
  });
});

describe('concurrency', () => {
  it('30 parallel correct coordinate submits give exactly 1 winner', async () => {
    const teams = await Promise.all(
      Array.from({ length: 30 }, (_, i) => createTeam(`Team ${String(i).padStart(2, '0')}`)),
    );

    const results = await Promise.all(
      teams.map((team) =>
        sql.begin(async (tx) => {
          const [state] = await tx`
            SELECT coordinates_locked, winner_bonus_points
              FROM app.event_state WHERE id = 1 FOR UPDATE`;
          if (state.coordinates_locked) return 'locked';
          await tx`
            INSERT INTO app.coordinate_submissions (team_id, submitted_hash, is_correct)
            VALUES (${team}, 'h', true)`;
          await tx`
            UPDATE app.event_state
               SET coordinates_locked = true, coordinate_winner_id = ${team}, coordinate_won_at = now()
             WHERE id = 1`;
          await tx`
            INSERT INTO app.winners (team_id, winner_type, bonus_points)
            VALUES (${team}, 'coordinates', ${state.winner_bonus_points})`;
          return 'winner';
        }),
      ),
    );

    expect(results.filter((r) => r === 'winner')).toHaveLength(1);
    expect(results.filter((r) => r === 'locked')).toHaveLength(29);
    const [{ winners }] = await sql`SELECT count(*)::int AS winners FROM app.winners`;
    const [{ correct }] = await sql`
      SELECT count(*)::int AS correct FROM app.coordinate_submissions WHERE is_correct`;
    expect({ winners, correct }).toEqual({ winners: 1, correct: 1 });
  });

  it('20 parallel identical solves give exactly 1 solve', async () => {
    const team = await createTeam('Team A');
    const challenge = await createChallenge(1);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        sql.begin(async (tx) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${team + ':' + challenge}))`;
          const [state] = await tx`SELECT phase FROM app.event_state WHERE id = 1 FOR SHARE`;
          expect(state.phase).toBe('onboarding');
          return tx`
            INSERT INTO app.solves (team_id, challenge_id, points_awarded, phase)
            VALUES (${team}, ${challenge}, 100, 'main_ctf')
            ON CONFLICT (team_id, challenge_id) DO NOTHING RETURNING id`;
        }),
      ),
    );

    expect(results.filter((rows) => rows.length === 1)).toHaveLength(1);
    const [{ solves }] = await sql`SELECT count(*)::int AS solves FROM app.solves`;
    expect(solves).toBe(1);
  });
});
