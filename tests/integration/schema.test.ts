// Checks migration 0003 (docs/07-Rules-v2.md). Wipes the app tables, so re-run `pnpm seed` afterwards.
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

const BASE = { easy: 60, medium: 110, difficult: 175, main_difficult: 400 } as const;

function levelOf(number: number): keyof typeof BASE {
  if (number <= 4) return 'easy';
  if (number <= 7) return 'medium';
  if (number <= 9) return 'difficult';
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

async function levelId(table: 'locations' | 'cosmic_keys', level: string): Promise<string> {
  const [row] =
    await sql`SELECT id FROM app.${sql(table)} WHERE level = ${level}::app.challenge_difficulty`;
  return row.id;
}

describe('structure', () => {
  it('has 26 tables and 4 views, all with RLS on', async () => {
    const [{ tables }] = await sql`
      SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname = 'app'`;
    const [{ views }] = await sql`
      SELECT count(*)::int AS views FROM pg_views WHERE schemaname = 'app'`;
    const [{ open }] = await sql`
      SELECT count(*)::int AS open FROM pg_tables WHERE schemaname = 'app' AND NOT rowsecurity`;
    expect({ tables, views, open }).toEqual({ tables: 26, views: 4, open: 0 });
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
    expect(views).toHaveLength(4);

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
  it('has the four locations, four keys and three surprises with the fixed rewards', async () => {
    const locations = await sql`
      SELECT level, reward_points::text AS reward, fragments_required FROM app.locations ORDER BY reward_points`;
    expect(locations).toEqual([
      { level: 'easy', reward: '180.0', fragments_required: 2 },
      { level: 'medium', reward: '330.0', fragments_required: 2 },
      { level: 'difficult', reward: '525.0', fragments_required: 2 },
      { level: 'main_difficult', reward: '1200.0', fragments_required: 1 },
    ]);
    const [{ keys }] = await sql`SELECT count(*)::int AS keys FROM app.cosmic_keys`;
    expect(keys).toBe(4);
    const surprises = await sql`
      SELECT kind, points::text AS points, enabled FROM app.surprise_events ORDER BY points`;
    expect(surprises).toEqual([
      { kind: 'spidey_signal', points: '30.0', enabled: false },
      { kind: 'flashy_spider', points: '50.0', enabled: false },
      { kind: 'spider_mutation', points: '70.0', enabled: false },
    ]);
  });

  it('survives a wipe, reset to unconfigured', async () => {
    await sql`UPDATE app.locations SET answer_hash = 'h', name = 'Somewhere'`;
    await wipeAppTables(sql);
    const [{ configured }] = await sql`
      SELECT count(*)::int AS configured FROM app.locations WHERE answer_hash IS NOT NULL OR name <> ''`;
    expect(configured).toBe(0);
    const [{ total }] = await sql`SELECT count(*)::int AS total FROM app.locations`;
    expect(total).toBe(4);
  });

  it('refuses to change a surprise reward', async () => {
    await expect(
      sql`UPDATE app.surprise_events SET points = 99 WHERE kind = 'spidey_signal'`,
    ).rejects.toThrow('surprise_fixed_points');
  });
});

describe('dynamic scoring', () => {
  it.each([
    ['easy', 1, ['60.0', '59.5', '59.0', '58.5', '58.0']],
    ['medium', 5, ['110.0', '109.5', '109.0']],
    ['difficult', 8, ['175.0', '174.5', '174.0']],
    ['main_difficult', 10, ['400.0', '399.5', '399.0']],
  ] as const)('%s decays by 0.5 per earlier solve', async (_level, number, expected) => {
    const challenge = await createChallenge(number);
    for (let i = 0; i < expected.length; i++) {
      await insertSolve(await createTeam(`Team ${i}`), challenge);
    }
    const rows = await sql`
      SELECT solve_position, points_awarded::text AS points FROM app.solves ORDER BY solve_position`;
    expect(rows.map((r) => r.points)).toEqual(expected);
    expect(rows.map((r) => r.solve_position)).toEqual(expected.map((_, i) => i + 1));
  });

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
    expect(rows.map((r) => r.points)).toEqual(['1.0', '0.5', '0.0', '0.0']);
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
      { category: 'challenge', points: '60.0', ref_type: 'solve', linked: true },
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
    expect(rows.map((r) => r.points)).toEqual(Array.from({ length: 30 }, (_, i) => 100 - 0.5 * i));
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
      VALUES (${team}, 'location', 180, 'location', ${id})`;
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
  it('sums the ledger by category, hides hidden teams and counts achievements', async () => {
    const admin = await createAdmin();
    const c1 = await createChallenge(1);
    const c2 = await createChallenge(2);
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    const hidden = await createTeam('Team Hidden', true);

    await insertSolve(hidden, c1); // 60
    await insertSolve(a, c1); // 59.5
    await insertSolve(a, c2); // 60
    await sql`
      INSERT INTO app.score_transactions (team_id, category, points, reason, admin_id)
      VALUES (${a}, 'adjustment', -20, 'test penalty', ${admin})`;

    const easy = await levelId('locations', 'easy');
    await sql`INSERT INTO app.location_achievements (team_id, location_id) VALUES (${b}, ${easy})`;
    await sql`
      INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
      VALUES (${b}, 'location', 180, 'location', ${easy})`;
    const key = await levelId('cosmic_keys', 'easy');
    await sql`INSERT INTO app.team_cosmic_keys (team_id, key_id) VALUES (${b}, ${key})`;
    const [surprise] = await sql`SELECT id FROM app.surprise_events WHERE kind = 'spidey_signal'`;
    await sql`
      INSERT INTO app.surprise_progress (team_id, event_id, completed_at) VALUES (${b}, ${surprise.id}, now())`;
    await sql`
      INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
      VALUES (${b}, 'surprise', 30, 'surprise', ${surprise.id})`;

    const board = await sql`
      SELECT team_name, total::text AS total, challenge_points::text AS challenge,
             location_points::text AS location, surprise_points::text AS surprise,
             adjustment_points::text AS adjustment, solves, locations, keys, surprises, rank_all
        FROM app.v_scoreboard ORDER BY rank_all, team_name`;
    expect(board).toEqual([
      {
        team_name: 'Team B',
        total: '210.0',
        challenge: '0.0',
        location: '180.0',
        surprise: '30.0',
        adjustment: '0.0',
        solves: 0,
        locations: 1,
        keys: 1,
        surprises: 1,
        rank_all: 1,
      },
      {
        team_name: 'Team A',
        total: '99.5',
        challenge: '119.5',
        location: '0.0',
        surprise: '0.0',
        adjustment: '-20.0',
        solves: 2,
        locations: 0,
        keys: 0,
        surprises: 0,
        rank_all: 2,
      },
      {
        team_name: 'Team Hidden',
        total: '60.0',
        challenge: '60.0',
        location: '0.0',
        surprise: '0.0',
        adjustment: '0.0',
        solves: 1,
        locations: 0,
        keys: 0,
        surprises: 0,
        rank_all: 3,
      },
    ]);

    const publicBoard = await sql`
      SELECT rank, team_name, total::text AS total FROM app.v_public_scoreboard ORDER BY rank`;
    expect(publicBoard).toEqual([
      { rank: 1, team_name: 'Team B', total: '210.0' },
      { rank: 2, team_name: 'Team A', total: '99.5' },
    ]);

    const columns = await sql`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name = 'v_public_scoreboard'`;
    expect(columns.map((c) => c.column_name)).not.toContain('team_id');

    const feed = await sql`SELECT team_name FROM app.v_public_feed`;
    expect(feed.map((f) => f.team_name).sort()).toEqual(['Team A', 'Team A']);
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

describe('fragments and locations', () => {
  async function fragment(challenge: string, level: string, label: string, value: string) {
    const location = await levelId('locations', level);
    await sql`
      INSERT INTO app.coordinate_fragments (location_id, challenge_id, label, value)
      VALUES (${location}, ${challenge}, ${label}, ${value})`;
  }

  it('gives a team a fragment only once it has solved that challenge', async () => {
    const c1 = await createChallenge(1);
    const c2 = await createChallenge(2);
    await fragment(c1, 'easy', 'A', '47');
    await fragment(c2, 'easy', 'B', '00');
    const a = await createTeam('Team A');
    const b = await createTeam('Team B');
    await insertSolve(a, c1);
    await insertSolve(b, c2);

    const rows = await sql`
      SELECT t.name, f.label, f.value FROM app.v_team_fragments f JOIN app.teams t ON t.id = f.team_id
       ORDER BY t.name`;
    expect(rows).toEqual([
      { name: 'Team A', label: 'A', value: '47' },
      { name: 'Team B', label: 'B', value: '00' },
    ]);
  });

  it('allows one fragment per challenge and one label per location', async () => {
    const c1 = await createChallenge(1);
    const c2 = await createChallenge(2);
    await fragment(c1, 'easy', 'A', '47');
    await expect(fragment(c1, 'easy', 'B', '00')).rejects.toThrow(
      'coordinate_fragments_challenge_id_key',
    );
    await expect(fragment(c2, 'easy', 'A', '00')).rejects.toThrow(
      'coordinate_fragments_location_id_label_key',
    );
  });

  it('records one correct location submission per team, but keeps every wrong attempt', async () => {
    const team = await createTeam('Team A');
    const other = await createTeam('Team B');
    const location = await levelId('locations', 'easy');
    const submit = (t: string, correct: boolean) => sql`
      INSERT INTO app.location_submissions (team_id, location_id, submitted_hash, is_correct)
      VALUES (${t}, ${location}, 'h', ${correct})`;
    await submit(team, false);
    await submit(team, false);
    await submit(team, true);
    await expect(submit(team, true)).rejects.toThrow('location_sub_one_correct_uq');
    await submit(other, true);
    const [{ rows }] = await sql`SELECT count(*)::int AS rows FROM app.location_submissions`;
    expect(rows).toBe(4);
  });

  it('records each location achievement and each key once per team', async () => {
    const team = await createTeam('Team A');
    const location = await levelId('locations', 'easy');
    const key = await levelId('cosmic_keys', 'easy');
    await sql`INSERT INTO app.location_achievements (team_id, location_id) VALUES (${team}, ${location})`;
    await expect(
      sql`INSERT INTO app.location_achievements (team_id, location_id) VALUES (${team}, ${location})`,
    ).rejects.toThrow('location_achievements_pkey');
    await sql`INSERT INTO app.team_cosmic_keys (team_id, key_id) VALUES (${team}, ${key})`;
    await expect(
      sql`INSERT INTO app.team_cosmic_keys (team_id, key_id) VALUES (${team}, ${key})`,
    ).rejects.toThrow('team_cosmic_keys_pkey');
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

  it('rejects challenge number 0 and 11', async () => {
    await expect(insertChallenge(0)).rejects.toThrow('challenges_number_range');
    await expect(insertChallenge(11)).rejects.toThrow('challenges_number_range');
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
