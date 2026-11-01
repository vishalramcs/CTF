// Checks migrations 0003 and 0004 (docs/07-Rules-v2.md, docs/08-Question-Rules.md). Wipes the app tables, so re-run `pnpm seed` afterwards.
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

const BASE = { easy: 50, medium: 75, difficult: 100, main_difficult: 200 } as const;

function levelOf(number: number): keyof typeof BASE {
  if (number <= 4) return 'easy';
  if (number <= 8) return 'medium';
  if (number <= 12) return 'difficult';
  return 'main_difficult';
}

async function createTeam(name: string, isHidden = false): Promise<string> {
  const slug = name.toLowerCase().replaceAll(' ', '-');
  const [row] = await sql`
    INSERT INTO app.teams (name, slug, is_hidden) VALUES (${name}, ${slug}, ${isHidden})
    RETURNING id`;
  return row.id;
}

async function createAdmin(level: 'super_admin' | 'developer' = 'super_admin'): Promise<string> {
  const [row] = await sql`
    INSERT INTO app.users (username, password_hash, role, admin_level)
    VALUES ('admin', 'x', 'admin', ${level}) RETURNING id`;
  return row.id;
}

function insertChallenge(
  number: number,
  overrides: Record<string, string | boolean | number | null> = {},
) {
  const difficulty = levelOf(number);
  const row = {
    number,
    slug: `c${number}`,
    title: `Challenge ${number}`,
    difficulty,
    category: 'test',
    base_points: BASE[difficulty],
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

// Position, points and the ledger row are the database's job: the app passes none of them.
function insertSolve(teamId: string, challengeId: string) {
  return sql`INSERT INTO app.solves (team_id, challenge_id) VALUES (${teamId}, ${challengeId})`;
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

describe('reference rows', () => {
  it('has the three surprises with the fixed rewards', async () => {
    const surprises = await sql`
      SELECT kind, points::text AS points, enabled FROM app.surprise_events ORDER BY points`;
    expect(surprises).toEqual([
      { kind: 'spidey_signal', points: '30.00', enabled: false },
      { kind: 'flashy_spider', points: '50.00', enabled: false },
      { kind: 'spider_mutation', points: '70.00', enabled: false },
    ]);
  });

  it('keeps the surprises through a wipe, reset to unconfigured', async () => {
    await sql`UPDATE app.surprise_events SET enabled = true, answer_hash = 'h'`;
    await wipeAppTables(sql);
    const [{ configured, total }] = await sql`
      SELECT count(*) FILTER (WHERE enabled OR answer_hash IS NOT NULL)::int AS configured,
             count(*)::int AS total FROM app.surprise_events`;
    expect({ configured, total }).toEqual({ configured: 0, total: 3 });
  });

  it('refuses to change a surprise reward', async () => {
    await expect(
      sql`UPDATE app.surprise_events SET points = 99 WHERE kind = 'spidey_signal'`,
    ).rejects.toThrow('surprise_fixed_points');
  });
});

describe('dynamic scoring', () => {
  it.each([
    ['easy', 1, ['50.00', '49.50', '49.00', '48.50', '48.00', '47.75', '47.50']],
    ['medium', 5, ['75.00', '74.50', '74.00', '73.50', '73.00', '72.75', '72.50']],
    ['difficult', 9, ['100.00', '99.50', '99.00', '98.50', '98.00', '97.75', '97.50']],
    ['main_difficult', 13, ['200.00', '199.50', '199.00', '198.50', '198.00', '197.75', '197.50']],
  ] as const)(
    '%s decays by 0.5 to the 5th solve, then 0.25, without rounding',
    async (_level, number, expected) => {
      const challenge = await createChallenge(number);
      for (let i = 0; i < expected.length; i++) {
        await insertSolve(await createTeam(`Team ${i}`), challenge);
      }
      const rows = await sql`
      SELECT solve_position, points_awarded::text AS points FROM app.solves ORDER BY solve_position`;
      expect(rows.map((r) => r.points)).toEqual(expected);
      expect(rows.map((r) => r.solve_position)).toEqual(expected.map((_, i) => i + 1));
    },
  );

  it('counts each challenge on its own', async () => {
    const c1 = await createChallenge(1);
    const c2 = await createChallenge(2);
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    await insertSolve(a, c1);
    await insertSolve(b, c1);
    await insertSolve(b, c2);
    const rows = await sql`
      SELECT c.number, s.solve_position FROM app.solves s JOIN app.challenges c ON c.id = s.challenge_id
       ORDER BY c.number, s.solve_position`;
    expect(rows).toEqual([
      { number: 1, solve_position: 1 },
      { number: 1, solve_position: 2 },
      { number: 2, solve_position: 1 },
    ]);
  });

  it('never goes below zero', async () => {
    const challenge = await createChallenge(1);
    await sql`UPDATE app.challenges SET base_points = 1 WHERE id = ${challenge}`;
    for (let i = 0; i < 4; i++) await insertSolve(await createTeam(`Team ${i}`), challenge);
    const rows =
      await sql`SELECT points_awarded::text AS points FROM app.solves ORDER BY solve_position`;
    expect(rows.map((r) => r.points)).toEqual(['1.00', '0.50', '0.00', '0.00']);
    // A zero-point solve leaves no ledger row (ledger points must be non-zero).
    const [{ ledger }] = await sql`SELECT count(*)::int AS ledger FROM app.score_transactions`;
    expect(ledger).toBe(2);
  });

  it('writes one ledger row per solve, in the same statement', async () => {
    const challenge = await createChallenge(1);
    const team = await createTeam('Team A');
    await insertSolve(team, challenge);
    const rows = await sql`
      SELECT t.category, t.points::text AS points, t.ref_type, t.ref_id = s.id AS linked
        FROM app.score_transactions t JOIN app.solves s ON s.team_id = t.team_id`;
    expect(rows).toEqual([
      { category: 'challenge', points: '50.00', ref_type: 'solve', linked: true },
    ]);
  });

  it('30 teams solving at once get positions 1 to 30, each once, with matching points', async () => {
    const challenge = await createChallenge(1);
    await sql`UPDATE app.challenges SET base_points = 100 WHERE id = ${challenge}`;
    const teams = await Promise.all(
      Array.from({ length: 30 }, (_, i) => createTeam(`Team ${String(i).padStart(2, '0')}`)),
    );
    await Promise.all(teams.map((team) => insertSolve(team, challenge)));

    const rows = await sql`
      SELECT solve_position, points_awarded::float AS points FROM app.solves ORDER BY solve_position`;
    expect(rows.map((r) => r.solve_position)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(rows.map((r) => r.points)).toEqual(
      Array.from({ length: 30 }, (_, i) => (i < 5 ? 100 - 0.5 * i : 100 - 2 - 0.25 * (i - 4))),
    );
    const [{ ledger }] = await sql`SELECT count(*)::int AS ledger FROM app.score_transactions`;
    expect(ledger).toBe(30);
  });

  it('20 parallel identical solves by one team give exactly 1 solve and 1 ledger row', async () => {
    const team = await createTeam('Team A');
    const challenge = await createChallenge(1);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => insertSolve(team, challenge)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [{ solves, ledger }] = await sql`
      SELECT (SELECT count(*) FROM app.solves)::int AS solves,
             (SELECT count(*) FROM app.score_transactions)::int AS ledger`;
    expect({ solves, ledger }).toEqual({ solves: 1, ledger: 1 });
    // The rejected attempts must not leave a gap in the positions.
    const [{ position }] = await sql`SELECT solve_position AS position FROM app.solves`;
    expect(position).toBe(1);
  });

  it('rejects a repeat solve by the same team', async () => {
    const team = await createTeam('Team A');
    const challenge = await createChallenge(1);
    await insertSolve(team, challenge);
    await expect(insertSolve(team, challenge)).rejects.toThrow('solves_team_id_challenge_id_key');
  });
});

describe('ledger', () => {
  it('refuses to pay the same event twice', async () => {
    const team = await createTeam('Team A');
    const [{ id }] = await sql`SELECT gen_random_uuid() AS id`;
    const pay = () => sql`
      INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
      VALUES (${team}, 'surprise', 180, 'surprise', ${id})`;
    await pay();
    await expect(pay()).rejects.toThrow('ledger_once_uq');
  });

  it('requires a reason and an admin for adjustments, and refuses zero', async () => {
    const admin = await createAdmin();
    const team = await createTeam('Team A');
    const adjust = (reason: string, points = 10, adminId: string | null = admin) => sql`
      INSERT INTO app.score_transactions (team_id, category, points, reason, admin_id)
      VALUES (${team}, 'adjustment', ${points}, ${reason}, ${adminId})`;
    await expect(adjust('   ')).rejects.toThrow('ledger_adjustment_shape');
    await expect(adjust('valid reason', 10, null)).rejects.toThrow('ledger_adjustment_shape');
    await expect(adjust('valid reason', 0)).rejects.toThrow('score_transactions_points_check');
    await adjust('valid reason', -5);
    await adjust('valid reason', -5);
  });

  it('refuses a negative non-adjustment', async () => {
    const team = await createTeam('Team A');
    await expect(
      sql`INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
          VALUES (${team}, 'surprise', -5, 'surprise', gen_random_uuid())`,
    ).rejects.toThrow('ledger_adjustment_shape');
  });
});

describe('scoreboard', () => {
  it('sums the ledger by category, hides hidden teams and counts solves by difficulty', async () => {
    const admin = await createAdmin();
    const c1 = await createChallenge(1);
    const c2 = await createChallenge(2);
    const c5 = await createChallenge(5);
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    const hidden = await createTeam('Team Hidden', true);

    await insertSolve(hidden, c1); // 50
    await insertSolve(a, c1); // 49.5
    await insertSolve(a, c2); // 50
    await insertSolve(a, c5); // 75
    await sql`
      INSERT INTO app.score_transactions (team_id, category, points, reason, admin_id)
      VALUES (${a}, 'adjustment', -20, 'test penalty', ${admin})`;

    const [surprise] = await sql`SELECT id FROM app.surprise_events WHERE kind = 'spidey_signal'`;
    await sql`
      INSERT INTO app.surprise_progress (team_id, event_id, completed_at) VALUES (${b}, ${surprise.id}, now())`;
    await sql`
      INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
      VALUES (${b}, 'surprise', 30, 'surprise', ${surprise.id})`;

    const board = await sql`
      SELECT team_name, total::text AS total, challenge_points::text AS challenge,
             surprise_points::text AS surprise, adjustment_points::text AS adjustment, solves,
             easy_solved, medium_solved, difficult_solved, surprises, rank_all
        FROM app.v_scoreboard ORDER BY rank_all, team_name`;
    expect(board).toEqual([
      {
        team_name: 'Team A',
        total: '154.50',
        challenge: '174.50',
        surprise: '0.00',
        adjustment: '-20.00',
        solves: 3,
        easy_solved: 2,
        medium_solved: 1,
        difficult_solved: 0,
        surprises: 0,
        rank_all: 1,
      },
      {
        team_name: 'Team Hidden',
        total: '50.00',
        challenge: '50.00',
        surprise: '0.00',
        adjustment: '0.00',
        solves: 1,
        easy_solved: 1,
        medium_solved: 0,
        difficult_solved: 0,
        surprises: 0,
        rank_all: 2,
      },
      {
        team_name: 'Team B',
        total: '30.00',
        challenge: '0.00',
        surprise: '30.00',
        adjustment: '0.00',
        solves: 0,
        easy_solved: 0,
        medium_solved: 0,
        difficult_solved: 0,
        surprises: 1,
        rank_all: 3,
      },
    ]);

    const publicBoard = await sql`
      SELECT rank, team_name, total::text AS total, easy_solved, main_done, coordinates_done
        FROM app.v_public_scoreboard ORDER BY rank`;
    expect(publicBoard).toEqual([
      {
        rank: 1,
        team_name: 'Team A',
        total: '154.50',
        easy_solved: 2,
        main_done: false,
        coordinates_done: false,
      },
      {
        rank: 2,
        team_name: 'Team B',
        total: '30.00',
        easy_solved: 0,
        main_done: false,
        coordinates_done: false,
      },
    ]);

    const columns = await sql`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name IN ('v_public_scoreboard', 'v_public_feed')`;
    expect(columns.map((c) => c.column_name)).not.toContain('team_id');

    const feed = await sql`SELECT team_name FROM app.v_public_feed`;
    expect(feed.map((f) => f.team_name).sort()).toEqual(['Team A', 'Team A', 'Team A']);
  });

  it('breaks ties by who reached the total first, and shares the rank when still tied', async () => {
    const challenge = await createChallenge(1);
    const late = await createTeam('A Late');
    const early = await createTeam('Z Early');
    await createTeam('No Score B');
    await createTeam('No Score A');
    await sql`
      INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id, created_at)
      VALUES (${late}, 'challenge', 60, 'solve', gen_random_uuid(), now()),
             (${early}, 'challenge', 60, 'solve', gen_random_uuid(), now() - interval '1 minute')`;
    expect(challenge).toBeTruthy();

    const board = await sql`
      SELECT team_name, rank FROM app.v_public_scoreboard ORDER BY rank, team_name`;
    expect(board).toEqual([
      { team_name: 'Z Early', rank: 1 },
      { team_name: 'A Late', rank: 2 },
      { team_name: 'No Score A', rank: 3 },
      { team_name: 'No Score B', rank: 3 },
    ]);
  });
});

describe('fragments and the coordinate race', () => {
  const setFragment = (number: number, value: string | null, order: number | null) =>
    sql`UPDATE app.challenges SET fragment_value = ${value}, coordinate_order = ${order}
         WHERE number = ${number}`;

  it('sets a fragment and its order together, order 1 to 6, unique', async () => {
    await createChallenge(1);
    await createChallenge(2);
    await setFragment(1, '47', 3);
    await expect(setFragment(2, '00', 3)).rejects.toThrow('challenges_coordinate_order_uq');
    await expect(setFragment(2, '00', 7)).rejects.toThrow('challenges_coordinate_order_check');
    await expect(setFragment(2, '00', null)).rejects.toThrow('challenges_fragment_pair');
    await expect(setFragment(2, null, 2)).rejects.toThrow('challenges_fragment_pair');
  });

  it('refuses a fragment on the Main Question, and a second Main Question', async () => {
    await createChallenge(13);
    await expect(setFragment(13, '11', 1)).rejects.toThrow('challenges_no_main_fragment');
    await expect(
      insertChallenge(12, { difficulty: 'main_difficult', base_points: 200 }),
    ).rejects.toThrow('challenges_one_main_uq');
  });

  it('keeps final coordinates to positions 1 to 3', async () => {
    await sql`INSERT INTO app.final_coordinates (position, value) VALUES (1, 'a'), (3, 'c')`;
    await expect(
      sql`INSERT INTO app.final_coordinates (position, value) VALUES (4, 'd')`,
    ).rejects.toThrow('final_coordinates_position_check');
  });

  it('records one correct coordinate submission per team, but keeps every wrong attempt', async () => {
    const team = await createTeam('Team A');
    const other = await createTeam('Team B');
    const submit = (t: string, correct: boolean) => sql`
      INSERT INTO app.coordinate_submissions (team_id, submitted_hash, is_correct)
      VALUES (${t}, 'h', ${correct})`;
    await submit(team, false);
    await submit(team, false);
    await submit(team, true);
    await expect(submit(team, true)).rejects.toThrow('coordinate_sub_one_correct_uq');
    await submit(other, true);
    const [{ rows }] = await sql`SELECT count(*)::int AS rows FROM app.coordinate_submissions`;
    expect(rows).toBe(4);
  });
});

describe('surprises', () => {
  it('scores each surprise once per team, with every wrong attempt kept', async () => {
    const team = await createTeam('Team A');
    const [event] = await sql`SELECT id FROM app.surprise_events WHERE kind = 'flashy_spider'`;
    const submit = (correct: boolean) => sql`
      INSERT INTO app.surprise_submissions (event_id, team_id, submitted_hash, is_correct)
      VALUES (${event.id}, ${team}, 'h', ${correct})`;
    await submit(false);
    await submit(true);
    await expect(submit(true)).rejects.toThrow('surprise_sub_one_correct_uq');
  });

  it('keeps one progress row per team and surprise', async () => {
    const team = await createTeam('Team A');
    const [event] = await sql`SELECT id FROM app.surprise_events WHERE kind = 'spider_mutation'`;
    const discover = () =>
      sql`INSERT INTO app.surprise_progress (team_id, event_id) VALUES (${team}, ${event.id})`;
    await discover();
    await expect(discover()).rejects.toThrow('surprise_progress_pkey');
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
    ['zero base points', { base_points: 0 }, 'challenges_points_nonneg'],
  ])('rejects %s', async (_name, overrides, constraint) => {
    await expect(insertChallenge(1, overrides)).rejects.toThrow(constraint);
  });

  it('rejects challenge number 0 and 14', async () => {
    await expect(insertChallenge(0)).rejects.toThrow('challenges_number_range');
    await expect(insertChallenge(14)).rejects.toThrow('challenges_number_range');
  });

  it('rejects an admin without a level and a team user with one', async () => {
    await expect(
      sql`INSERT INTO app.users (username, password_hash, role) VALUES ('a', 'x', 'admin')`,
    ).rejects.toThrow('users_admin_level');
    const team = await createTeam('Team A');
    await expect(
      sql`INSERT INTO app.users (username, password_hash, role, team_id, admin_level)
          VALUES ('t', 'x', 'team', ${team}, 'developer')`,
    ).rejects.toThrow('users_admin_level');
    await createAdmin('developer');
  });

  it('rejects a second event_state row and an unknown status', async () => {
    await expect(sql`INSERT INTO app.event_state (id) VALUES (2)`).rejects.toThrow(
      'event_state_id_check',
    );
    await expect(sql`UPDATE app.event_state SET status = 'bogus'`).rejects.toThrow(
      'event_state_status_check',
    );
    await sql`UPDATE app.event_state SET status = 'running'`;
  });
});

describe('broadcast gate', () => {
  it('opens once per window', async () => {
    const [first] = await sql`SELECT app.try_open_gate('board') AS open`;
    const [second] = await sql`SELECT app.try_open_gate('board') AS open`;
    expect([first.open, second.open]).toEqual([true, false]);
  });
});
