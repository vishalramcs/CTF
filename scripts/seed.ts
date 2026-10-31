// Dev data per docs/06-Implementation-Plan.md §3 and docs/07-Rules-v2.md and docs/08-Question-Rules.md. Wipes every app table first.
import { mkdirSync, writeFileSync } from 'node:fs';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import { hmacHex } from '@/lib/crypto/hmac';
import * as schema from '@/lib/db/schema';
import { isWipeable, wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { buildTeamFlag, deriveSeed, teamToken } from '@/lib/variants/derive';
import { regenerateVariants } from '@/lib/variants/regenerate';

const TEAM_COUNT = 10;

// docs/08 §1: Easy 50, Medium 75, Difficult 100, Main Question 200.
const BASE_POINTS = {
  easy: 50,
  medium: 75,
  difficult: 100,
  main_difficult: 200,
} as const;

type Level = keyof typeof BASE_POINTS;

// Placeholder fragments (docs/08 §3): 2 Easy, 2 Medium, 2 Difficult, with orders 1-6 once each.
// Real values come from the organisers.
const FRAGMENTS: Record<number, { value: string; order: number }> = {
  1: { value: '47', order: 3 },
  3: { value: '00', order: 1 },
  5: { value: '02', order: 5 },
  7: { value: '77', order: 2 },
  9: { value: '10', order: 6 },
  11: { value: '28', order: 4 },
};

// Placeholder final coordinates and final location. Real ones come from the organisers.
const FINAL_COORDINATES = [
  { position: 1, label: 'PLACEHOLDER A', value: '11.0' },
  { position: 2, label: 'PLACEHOLDER B', value: '76.9' },
  { position: 3, label: 'PLACEHOLDER C', value: '42' },
];

function levelOf(number: number): Level {
  if (number <= 4) return 'easy';
  if (number <= 8) return 'medium';
  if (number <= 12) return 'difficult';
  return 'main_difficult';
}

function placeholderChallenge(number: number) {
  const difficulty = levelOf(number);
  return {
    number,
    slug: `placeholder-${number}`,
    title: number === 13 ? 'PLACEHOLDER — Main Question' : `PLACEHOLDER — question ${number}`,
    difficulty,
    category: 'placeholder',
    basePoints: BASE_POINTS[difficulty],
    storyMd: `PLACEHOLDER story ${number}.`,
    questionTemplate: `<p>PLACEHOLDER — question ${number}. Decode and submit:</p><p>{{flag|base64}}</p>`,
    generatorKey: 'placeholder',
    flagTemplate: FRAGMENTS[number] ? '{{fragment}}_{{token}}' : '{{token}}',
    isPublished: true,
    fragmentValue: FRAGMENTS[number]?.value ?? null,
    coordinateOrder: FRAGMENTS[number]?.order ?? null,
    orderClue: FRAGMENTS[number] ? `PLACEHOLDER order clue for #${number}` : null,
  };
}

async function main() {
  const force = process.argv.includes('--force');
  const url = env.DIRECT_DATABASE_URL;
  const wipeable = isWipeable(url, process.env.WIPEABLE_DB_REF);
  if (!force && (process.env.NODE_ENV === 'production' || !wipeable)) {
    throw new Error(
      'Refusing to wipe this database. Use a local one, set WIPEABLE_DB_REF to the dev project ref, or pass --force.',
    );
  }

  const adminUsername = process.env.SEED_ADMIN_USERNAME;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword || adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD (12+ chars) are required');
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle({ client: sql, schema });
  const keys = {
    variantKey: env.VARIANT_HMAC_KEY,
    flagKey: env.FLAG_HMAC_KEY,
    flagPrefix: env.FLAG_PREFIX,
  };

  await wipeAppTables(sql);

  await db.insert(schema.users).values({
    username: adminUsername,
    passwordHash: await hashPassword(adminPassword),
    role: 'admin',
    adminLevel: 'super_admin',
  });

  const credentials: string[] = ['team,password'];
  const teams = [];
  for (let i = 1; i <= TEAM_COUNT; i++) {
    const nn = String(i).padStart(2, '0');
    const name = `Test Team ${nn}`;
    const password = teamPassword(name);
    const [team] = await db
      .insert(schema.teams)
      .values({ name, slug: `test-team-${nn}` })
      .returning();
    await db.insert(schema.users).values({
      username: name,
      passwordHash: await hashPassword(password),
      role: 'team',
      teamId: team.id,
    });
    credentials.push(`${name},${password}`);
    teams.push(team);
  }

  const challenges = await db
    .insert(schema.challenges)
    .values(Array.from({ length: 13 }, (_, i) => placeholderChallenge(i + 1)))
    .returning();

  await db.insert(schema.challengeHints).values(
    challenges.flatMap((c) =>
      [1, 2].map((hintOrder) => ({
        challengeId: c.id,
        hintOrder,
        contentMd: `PLACEHOLDER hint ${hintOrder} for question ${c.number}.`,
      })),
    ),
  );

  await db.insert(schema.finalCoordinates).values(FINAL_COORDINATES);

  await db.update(schema.eventState).set({
    status: 'running',
    // Placeholder final location, so the submit box can be tried in dev.
    coordinateAnswerHash: hmacHex(env.COORD_HMAC_KEY, 'placeholder'),
  });

  const variantCount = await regenerateVariants(db, {});
  const flags: string[] = ['team,challenge,flag'];
  for (const team of teams) {
    for (const challenge of challenges) {
      const token = teamToken(deriveSeed(keys.variantKey, team.id, challenge.id));
      const flag = buildTeamFlag(keys.flagPrefix, challenge.flagTemplate!, {
        token,
        fragment: FRAGMENTS[challenge.number]?.value ?? null,
      });
      flags.push(`${team.name},${challenge.number},${flag}`);
    }
  }

  mkdirSync('seed-output', { recursive: true });
  writeFileSync('seed-output/credentials.csv', credentials.join('\n') + '\n');
  writeFileSync('seed-output/test-flags.csv', flags.join('\n') + '\n');

  console.table({
    admins: 1,
    teams: teams.length,
    challenges: challenges.length,
    hints: challenges.length * 2,
    variants: variantCount,
  });
  console.log('Wrote seed-output/credentials.csv and seed-output/test-flags.csv');

  await sql.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
