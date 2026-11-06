// One-off (7 Nov, docs/12): installs the organiser's new answers and Q13's six beacon flags.
// Reads them from the git-ignored seed-output/answers-2026-11-07.json; prints no flag.
// Needs migration 0008. One transaction: hashes, Q13 parts and text, variants, audit rows.
import { readFileSync } from 'node:fs';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hmacHex } from '@/lib/crypto/hmac';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalizeFlag } from '@/lib/flags/normalize';
import { regenerateVariants } from '@/lib/variants/regenerate';

const Q13_STORY = 'Ned’s tracker heard many voices before the target vanished. Only one was real.';
const Q13_TEXT =
  '<p>Find the real signal. Each of its six beacons carries its own flag. Submit them one at a ' +
  'time, in any order: each one you find reveals one coordinate fragment.</p>' +
  '<p>Flag format: <code>EYE{WORD}</code></p>';

function hashOf(flag: string) {
  const normalized = normalizeFlag(flag, env.FLAG_PREFIX);
  if (!normalized) throw new Error('A flag does not match the prefix.');
  return hmacHex(env.FLAG_HMAC_KEY, normalized);
}

async function main() {
  const answers = JSON.parse(readFileSync('seed-output/answers-2026-11-07.json', 'utf-8')) as {
    static: Record<string, string>;
    q13_parts: string[];
  };
  if (answers.q13_parts.length !== 6) throw new Error('Q13 needs six flags.');
  const client = postgres(env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    await db.transaction(async (tx) => {
      const audit = (id: string, reason: string) =>
        tx.execute(sql`INSERT INTO app.audit_log (action, entity_type, entity_id, details)
          VALUES ('challenge.set_flag', 'challenge', ${id}, ${JSON.stringify({ reason })}::jsonb)`);
      for (const [number, flag] of Object.entries(answers.static)) {
        const [c] = await tx.execute<{ id: string }>(sql`
          UPDATE app.challenges SET static_flag_hash = ${hashOf(flag)},
                 generator_version = generator_version + 1
           WHERE number = ${Number(number)} AND flag_mode = 'static' RETURNING id`);
        if (!c) throw new Error(`Q${number} not found or not static.`);
        await audit(c.id, 'new answer, organiser 7 Nov');
        console.log(`Q${number}: new flag set`);
      }
      const [main] = await tx.execute<{ id: string }>(sql`
        UPDATE app.challenges SET story_md = ${Q13_STORY}, question_template = ${Q13_TEXT},
               generator_version = generator_version + 1
         WHERE number = 13 AND difficulty = 'main_difficult' RETURNING id`);
      if (!main) throw new Error('Q13 not found.');
      await tx.execute(sql`DELETE FROM app.challenge_parts WHERE challenge_id = ${main.id}`);
      for (const [i, flag] of answers.q13_parts.entries()) {
        await tx.execute(sql`INSERT INTO app.challenge_parts (challenge_id, part, flag_hash)
          VALUES (${main.id}, ${i + 1}, ${hashOf(flag)})`);
      }
      await audit(main.id, 'six beacon flags, organiser 7 Nov (docs/12)');
      console.log('Q13: six beacon flags set');
      console.log(`regenerated ${await regenerateVariants(tx, {})} team variants`);
    });
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
