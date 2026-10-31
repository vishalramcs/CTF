// Shared by the M4 integration tests. They wipe the app tables, so re-run `pnpm seed` afterwards.
import { NextRequest } from 'next/server';
import postgres from 'postgres';

import { csrfToken } from '@/lib/auth/csrf';
import { SESSION_COOKIE } from '@/lib/auth/shared';
import { hashSessionToken, randomToken } from '@/lib/crypto/tokens';
import { isWipeable } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { buildTeamFlag, deriveSeed, teamToken } from '@/lib/variants/derive';

export function openSql(): postgres.Sql {
  if (!isWipeable(env.DATABASE_URL, process.env.WIPEABLE_DB_REF)) {
    throw new Error('Refusing to wipe this database: set WIPEABLE_DB_REF to the dev project ref');
  }
  return postgres(env.DATABASE_URL, { prepare: false, max: 5, onnotice: () => {} });
}

export type Auth = { cookie: string; csrf: string };

export function request(
  path: string,
  { method = 'GET', auth, body }: { method?: string; auth?: Auth; body?: unknown } = {},
): NextRequest {
  return new NextRequest(`http://test${path}`, {
    method,
    headers: {
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(auth ? { cookie: `${SESSION_COOKIE}=${auth.cookie}`, 'x-csrf-token': auth.csrf } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
}

export function params<P>(value: P) {
  return { params: Promise.resolve(value) };
}

export async function createTeam(sql: postgres.Sql, username: string): Promise<string> {
  const [team] = await sql`
    WITH team AS (
      INSERT INTO app.teams (name, slug) VALUES (${`Team ${username}`}, ${username}) RETURNING id
    ), login AS (
      INSERT INTO app.users (username, password_hash, role, team_id)
      SELECT ${username}, 'x', 'team', id FROM team
    )
    SELECT id FROM team`;
  return team.id;
}

export async function sessionFor(sql: postgres.Sql, username: string): Promise<Auth> {
  const cookie = randomToken();
  const [row] = await sql`
    INSERT INTO app.sessions (user_id, role, team_id, token_hash, expires_at)
    SELECT id, role, team_id, ${hashSessionToken(cookie, env.SESSION_PEPPER)}, now() + interval '1 hour'
    FROM app.users WHERE username = ${username}
    RETURNING id`;
  return { cookie, csrf: csrfToken(row.id) };
}

export async function createAdminSession(sql: postgres.Sql): Promise<Auth> {
  await sql`INSERT INTO app.users (username, password_hash, role, admin_level)
    VALUES ('admin1', 'x', 'admin', 'super_admin')`;
  return sessionFor(sql, 'admin1');
}

export type TestChallenge = {
  id: string;
  number: number;
  fragment: string | null;
  flagTemplate: string;
};

// docs/07 §3.
const BASE = { easy: 60, medium: 110, difficult: 175, main_difficult: 400 };

function difficultyOf(number: number): keyof typeof BASE {
  if (number <= 4) return 'easy';
  if (number <= 7) return 'medium';
  return number <= 9 ? 'difficult' : 'main_difficult';
}

export async function createChallenge(
  sql: postgres.Sql,
  number: number,
  options: {
    // A fragment from the mapping: shown to a team only once it has solved this challenge.
    fragment?: { value: string; order: number; clue: string };
    questionTemplate?: string;
    evidence?: unknown[];
    generatorConfig?: unknown;
    isPublished?: boolean;
    hints?: string[];
  } = {},
): Promise<TestChallenge> {
  const difficulty = difficultyOf(number);
  const { fragment, hints = [] } = options;
  const flagTemplate = fragment ? '{{fragment}}_{{token}}' : '{{token}}';
  const [row] = await sql`
    INSERT INTO app.challenges (
      number, slug, title, difficulty, category, base_points,
      story_md, question_template, evidence, generator_config, flag_template, is_published
    ) VALUES (
      ${number}, ${`challenge-${number}`}, ${`Challenge ${number}`}, ${difficulty}, 'test',
      ${BASE[difficulty]}, ${`Story ${number}.`},
      ${options.questionTemplate ?? '<p>{{flag|base64}}</p>'},
      ${sql.json((options.evidence ?? []) as never)},
      ${sql.json((options.generatorConfig ?? {}) as never)},
      ${flagTemplate}, ${options.isPublished ?? true}
    ) RETURNING id`;
  if (fragment) {
    await sql`
      INSERT INTO app.coordinate_fragments (location_id, challenge_id, label, value, order_clue)
      SELECT id, ${row.id}, ${`F${fragment.order}`}, ${fragment.value}, ${fragment.clue}
        FROM app.locations WHERE level = ${difficulty}::app.challenge_difficulty`;
  }
  for (const [i, hint] of hints.entries()) {
    await sql`
      INSERT INTO app.challenge_hints (challenge_id, hint_order, content_md)
      VALUES (${row.id}, ${i + 1}, ${hint})`;
  }
  return { id: row.id, number, fragment: fragment?.value ?? null, flagTemplate };
}

export function setStatus(
  sql: postgres.Sql,
  status: 'not_started' | 'running' | 'paused' | 'ended',
) {
  return sql`UPDATE app.event_state SET status = ${status}`;
}

export function tokenOf(teamId: string, challenge: TestChallenge): string {
  return teamToken(deriveSeed(env.VARIANT_HMAC_KEY, teamId, challenge.id));
}

export function flagOf(teamId: string, challenge: TestChallenge): string {
  return buildTeamFlag(env.FLAG_PREFIX, challenge.flagTemplate, {
    token: tokenOf(teamId, challenge),
    fragment: challenge.fragment,
  });
}
