// Dev data per docs/06-Implementation-Plan.md §3. Wipes every app table first.
import { mkdirSync, writeFileSync } from 'node:fs';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hashPassword } from '@/lib/auth/password';
import { encrypt } from '@/lib/crypto/aead';
import { hmacHex } from '@/lib/crypto/hmac';
import { generatePassword } from '@/lib/crypto/tokens';
import * as schema from '@/lib/db/schema';
import { isWipeable, wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { buildTeamFlag, deriveSeed, expectedFlagHash, teamToken } from '@/lib/variants/derive';
import { placeholderGenerator } from '@/lib/variants/generators/placeholder';

const COORDINATES = '11.0247,77.0028';
const TEAM_COUNT = 10;

const POINTS = {
  easy: [100, 50],
  medium: [200, 100],
  difficult: [300, 150],
  main_difficult: [500, 500],
} as const;

const FRAGMENTS: Record<number, { value: string; order: number }> = {
  1: { value: '47', order: 3 },
  2: { value: '00', order: 5 },
  5: { value: '02', order: 2 },
  6: { value: '28', order: 6 },
  8: { value: '77', order: 4 },
  10: { value: '11', order: 1 },
};

function difficultyOf(number: number): keyof typeof POINTS {
  if (number <= 4) return 'easy';
  if (number <= 7) return 'medium';
  if (number <= 9) return 'difficult';
  return 'main_difficult';
}

function placeholderChallenge(number: number) {
  const isPractice = number === 0;
  // The enum has no 'practice' value: practice is 'easy' + is_practice (05 §3).
  const difficulty = difficultyOf(number);
  const [basePoints, aiPoints] = isPractice ? [0, 0] : POINTS[difficulty];
  const fragment = FRAGMENTS[number];
  return {
    number,
    slug: `placeholder-${number}`,
    title: `PLACEHOLDER — question ${number}`,
    difficulty,
    category: 'placeholder',
    isPractice,
    basePoints,
    aiPoints,
    storyMd: `PLACEHOLDER story ${number}.`,
    questionTemplate: `<p>PLACEHOLDER — question ${number}. Decode and submit:</p><p>{{flag|base64}}</p>`,
    generatorKey: 'placeholder',
    flagTemplate: fragment ? '{{fragment}}_{{token}}' : '{{token}}',
    hasFragment: Boolean(fragment),
    fragmentValue: fragment?.value ?? null,
    coordinateOrder: fragment?.order ?? null,
    orderClue: fragment ? `PLACEHOLDER order clue ${fragment.order}` : null,
    isPublished: true,
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
  });

  const credentials: string[] = ['team,username,password'];
  const teams = [];
  for (let i = 1; i <= TEAM_COUNT; i++) {
    const nn = String(i).padStart(2, '0');
    const name = `Test Team ${nn}`;
    const username = `team${nn}`;
    const password = generatePassword();
    const [team] = await db
      .insert(schema.teams)
      .values({ name, slug: `test-team-${nn}` })
      .returning();
    await db.insert(schema.users).values({
      username,
      passwordHash: await hashPassword(password),
      role: 'team',
      teamId: team.id,
    });
    credentials.push(`${name},${username},${password}`);
    teams.push(team);
  }

  const challenges = await db
    .insert(schema.challenges)
    .values(Array.from({ length: 11 }, (_, number) => placeholderChallenge(number)))
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

  await db.update(schema.eventState).set({
    coordinateAnswerHash: hmacHex(env.COORD_HMAC_KEY, COORDINATES),
    coordinateHemisphereLat: 'N',
    coordinateHemisphereLon: 'E',
    winnerBonusPoints: 300,
    finalTraceEnc: encrypt(
      env.REVEAL_ENC_KEY,
      JSON.stringify({ place: 'PLACEHOLDER', text: 'Spider-Man was found here.' }),
    ),
  });

  const flags: string[] = ['team,challenge,flag'];
  const variants = teams.flatMap((team) =>
    challenges.map((challenge) => {
      const token = teamToken(deriveSeed(keys.variantKey, team.id, challenge.id));
      const flag = buildTeamFlag(keys.flagPrefix, challenge.flagTemplate!, {
        token,
        fragment: challenge.fragmentValue,
      });
      flags.push(`${team.name},${challenge.number},${flag}`);
      return {
        teamId: team.id,
        challengeId: challenge.id,
        variantData: placeholderGenerator(challenge.questionTemplate, flag),
        expectedFlagHash: expectedFlagHash(flag, keys),
        generatorVersion: challenge.generatorVersion,
      };
    }),
  );
  await db.insert(schema.teamChallengeVariants).values(variants);

  mkdirSync('seed-output', { recursive: true });
  writeFileSync('seed-output/credentials.csv', credentials.join('\n') + '\n');
  writeFileSync('seed-output/test-flags.csv', flags.join('\n') + '\n');

  console.table({
    admins: 1,
    teams: teams.length,
    challenges: challenges.length,
    hints: challenges.length * 2,
    variants: variants.length,
  });
  console.log('Wrote seed-output/credentials.csv and seed-output/test-flags.csv');

  await sql.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
