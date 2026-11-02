import { and, eq, sql } from 'drizzle-orm';

import { decrypt } from '@/lib/crypto/aead';
import { db } from '@/lib/db/client';
import {
  challenges,
  coordinateSubmissions,
  eventState,
  solves,
  teams,
  vaultKeys,
} from '@/lib/db/schema';
import { env } from '@/lib/env';
import type { SealedMessage } from '@/lib/vault/crypto';
import sealed from '@/lib/workspace/files/q13-tracker/final_transmission.json';

// docs/09 §2: a key is a tier reward, earned by this many correct flags in that tier.
const TIERS = [
  { slot: 1, label: 'Easy', difficulty: 'easy', need: 2 },
  { slot: 2, label: 'Medium', difficulty: 'medium', need: 2 },
  { slot: 3, label: 'Hard', difficulty: 'difficult', need: 2 },
  { slot: 4, label: 'Main', difficulty: 'main_difficult', need: 1 },
] as const;

// Explicit columns, and a value is decrypted only for a key this team has earned.
export async function getVault(teamId: string) {
  const counts = await db
    .select({ difficulty: challenges.difficulty, solved: sql<number>`count(*)::int` })
    .from(solves)
    .innerJoin(challenges, eq(challenges.id, solves.challengeId))
    .where(eq(solves.teamId, teamId))
    .groupBy(challenges.difficulty);
  const stored = await db.select().from(vaultKeys);
  const [state] = await db
    .select({ released: eventState.decoderReleased })
    .from(eventState);
  const [team] = await db
    .select({ full: teams.fullAccess })
    .from(teams)
    .where(eq(teams.id, teamId));
  const [found] = await db
    .select({ id: coordinateSubmissions.id })
    .from(coordinateSubmissions)
    .where(
      and(eq(coordinateSubmissions.teamId, teamId), eq(coordinateSubmissions.isCorrect, true)),
    );

  const keys = TIERS.map(({ slot, label, difficulty, need }) => {
    const solved = counts.find((c) => c.difficulty === difficulty)?.solved ?? 0;
    const row = stored.find((k) => k.slot === slot);
    return {
      slot,
      label,
      need,
      solved,
      value: solved >= need && row ? decrypt(env.REVEAL_ENC_KEY, row.valueEnc) : null,
    };
  });
  return {
    keys,
    // The sealed message is public in the Q13 files; this only decides when the decoder appears.
    sealed: state.released || team?.full ? (sealed as SealedMessage) : null,
    found: found !== undefined,
  };
}

export type Vault = Awaited<ReturnType<typeof getVault>>;
