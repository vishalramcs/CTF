// Dev data per docs/06-Implementation-Plan.md §3 and docs/07-Rules-v2.md. Wipes every app table first.
import { mkdirSync, writeFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hashPassword } from '@/lib/auth/password';
import { hmacHex } from '@/lib/crypto/hmac';
import { generatePassword } from '@/lib/crypto/tokens';
import * as schema from '@/lib/db/schema';
import { isWipeable, wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { buildTeamFlag, deriveSeed, expectedFlagHash, teamToken } from '@/lib/variants/derive';
import { placeholderGenerator } from '@/lib/variants/generators/placeholder';

const TEAM_COUNT = 10;

// docs/07 §3: Easy 60, Medium 110, Hard 175, Main 400.
const BASE_POINTS = {
  easy: 60,
  medium: 110,
  difficult: 175,
  main_difficult: 400,
} as const;

type Level = keyof typeof BASE_POINTS;

// Placeholder fragment mapping (docs/07 §4). Easy: any 2 of 4. Medium: A on #5, B on #7, none on #6.
// Hard: both. Main: the one main coordinate. Real values come from the organisers.
const FRAGMENTS: Record<number, { label: string; value: string }> = {
  1: { label: 'A', value: '47' },
  2: { label: 'B', value: '00' },
  3: { label: 'C', value: '11' },
  4: { label: 'D', value: '28' },
  5: { label: 'A', value: '02' },
  7: { label: 'B', value: '77' },
  8: { label: 'A', value: '24' },
  9: { label: 'B', value: '10' },
  10: { label: 'A', value: '11' },
};

function levelOf(number: number): Level {
  if (number <= 4) return 'easy';
  if (number <= 7) return 'medium';
  if (number <= 9) return 'difficult';
  return 'main_difficult';
}

function placeholderChallenge(number: number) {
  const difficulty = levelOf(number);
  return {
    number,
    slug: `placeholder-${number}`,
    title: `PLACEHOLDER — question ${number}`,
    difficulty,
    category: 'placeholder',
    basePoints: BASE_POINTS[difficulty],
    storyMd: `PLACEHOLDER story ${number}.`,
    questionTemplate: `<p>PLACEHOLDER — question ${number}. Decode and submit:</p><p>{{flag|base64}}</p>`,
    generatorKey: 'placeholder',
    flagTemplate: FRAGMENTS[number] ? '{{fragment}}_{{token}}' : '{{token}}',
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
    adminLevel: 'super_admin',
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
    .values(Array.from({ length: 10 }, (_, i) => placeholderChallenge(i + 1)))
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

  const locations = await db.select().from(schema.locations);
  const locationOf = (level: Level) => locations.find((l) => l.level === level)!;
  await db.insert(schema.coordinateFragments).values(
    challenges.flatMap((c) => {
      const fragment = FRAGMENTS[c.number];
      return fragment
        ? [
            {
              locationId: locationOf(c.difficulty).id,
              challengeId: c.id,
              label: fragment.label,
              value: fragment.value,
              orderClue: `PLACEHOLDER order clue for #${c.number}`,
            },
          ]
        : [];
    }),
  );
  // Placeholder answer for every location, so the decoder can be tried in dev.
  for (const location of locations) {
    await db
      .update(schema.locations)
      .set({
        name: `PLACEHOLDER ${location.level} location`,
        answerHash: hmacHex(env.COORD_HMAC_KEY, 'placeholder'),
      })
      .where(eq(schema.locations.id, location.id));
  }

  await db.update(schema.eventState).set({ status: 'running' });

  const flags: string[] = ['team,challenge,flag'];
  const variants = teams.flatMap((team) =>
    challenges.map((challenge) => {
      const token = teamToken(deriveSeed(keys.variantKey, team.id, challenge.id));
      const flag = buildTeamFlag(keys.flagPrefix, challenge.flagTemplate!, {
        token,
        fragment: FRAGMENTS[challenge.number]?.value ?? null,
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
