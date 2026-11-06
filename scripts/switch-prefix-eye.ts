// One-off (7 Nov): every question's flag becomes EYE{...}. Run with FLAG_PREFIX=EYE in the env.
// The old SPIDEY flags are matched against their stored hashes first; nothing changes unless all
// match. Flags are never printed.
import { readFileSync } from 'node:fs';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { hmacHex } from '@/lib/crypto/hmac';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';
import { checkFlag } from '@/lib/flags/verify';
import { normalizeFlag } from '@/lib/flags/normalize';
import { regenerateVariants } from '@/lib/variants/regenerate';

async function main() {
  if (env.FLAG_PREFIX !== 'EYE') throw new Error('Run with FLAG_PREFIX=EYE.');
  const text = ['question-reference.md', 'held-questions.md']
    .map((f) => readFileSync(`seed-output/${f}`, 'utf-8'))
    .join('\n');
  const vault = JSON.parse(readFileSync('seed-output/vault.json', 'utf-8')) as { key04: string };
  const candidates = [
    ...new Set([...(text.match(/SPIDEY\{[^}\s]+\}/g) ?? []), `SPIDEY{${vault.key04}}`]),
  ];

  const client = postgres(env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    await db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string; number: number; hash: string | null }>(sql`
        SELECT id, number, static_flag_hash AS hash FROM app.challenges
        WHERE flag_mode = 'static' ORDER BY number FOR UPDATE`);
      const keys = { flagKey: env.FLAG_HMAC_KEY, flagPrefix: 'SPIDEY' };
      for (const row of rows) {
        const old = candidates.find(
          (c) => row.hash && checkFlag(c, row.hash, keys).result === 'correct',
        );
        if (!old && ![1, 5].includes(row.number)) {
          throw new Error(`Q${row.number}: old flag not found, nothing changed.`);
        }
        if (!old) {
          // Already EYE (Q1, Q5): only its text is touched.
          console.log(`Q${row.number}: no SPIDEY flag matches, flag left as is`);
        } else {
          const normalized = normalizeFlag(old.replace(/^SPIDEY/, 'EYE'), 'EYE')!;
          await tx.execute(sql`UPDATE app.challenges
            SET static_flag_hash = ${hmacHex(env.FLAG_HMAC_KEY, normalized)},
                generator_version = generator_version + 1
            WHERE id = ${row.id}`);
          console.log(`Q${row.number}: flag now EYE{...}`);
        }
        await tx.execute(sql`UPDATE app.challenges
          SET question_template = replace(question_template, 'SPIDEY{', 'EYE{'),
              story_md = replace(story_md, 'SPIDEY{', 'EYE{')
          WHERE id = ${row.id}`);
        await tx.execute(sql`INSERT INTO app.audit_log (action, entity_type, entity_id, details)
          VALUES ('challenge.set_flag', 'challenge', ${row.id},
                  ${JSON.stringify({ mode: 'static', reason: 'flag prefix switched to EYE' })}::jsonb)`);
      }
      const n = await regenerateVariants(tx, {});
      console.log(`regenerated ${n} team variants`);
    });
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
