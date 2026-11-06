import { randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { flashyConfig } from '@/lib/db/schema';
import { hashFlashyAnswer } from '@/lib/flashy/state';
import type { FlashyOption } from '@/lib/flashy/shared';

export type FlashySettings = {
  videoUrl?: string | null;
  videoSeconds?: number;
  bonusPoints?: number;
  // All four together, or none: the first is the correct one.
  correct?: string;
  wrong?: string[];
};

type Actor = { actorId: string; ip: string | null };

export type FlashyAdminView = Awaited<ReturnType<typeof loadFlashyAdmin>>;

// Never selects answer_hash. The labels are shown, but nothing says which one is correct.
export async function loadFlashyAdmin() {
  const [config] = await db
    .select({
      videoUrl: flashyConfig.videoUrl,
      videoSeconds: flashyConfig.videoSeconds,
      bonusPoints: flashyConfig.bonusPoints,
      question: flashyConfig.question,
      options: flashyConfig.options,
      hasAnswer: flashyConfig.answerHash,
    })
    .from(flashyConfig);

  const runs = await db.execute<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
    bonus_points: string;
    teams: number;
    playing: number;
    correct: number;
    wrong: number;
    skipped: number;
    open: number;
    paid: string;
  }>(sql`
    SELECT r.id, r.started_at, r.ended_at, r.bonus_points,
      count(p.team_id)::int AS teams,
      count(*) FILTER (WHERE p.playbacks > 0)::int AS playing,
      count(*) FILTER (WHERE p.state = 'answered' AND p.is_correct)::int AS correct,
      count(*) FILTER (WHERE p.state = 'answered' AND NOT p.is_correct)::int AS wrong,
      count(*) FILTER (WHERE p.state = 'skipped')::int AS skipped,
      count(*) FILTER (WHERE p.state = 'open')::int AS open,
      coalesce(sum(p.points_awarded), 0) AS paid
    FROM app.flashy_runs r
    LEFT JOIN app.flashy_participation p ON p.run_id = r.id
    GROUP BY r.id ORDER BY r.started_at DESC LIMIT 10`);

  const options = config.options as FlashyOption[];
  return {
    config: {
      videoUrl: config.videoUrl,
      videoSeconds: config.videoSeconds,
      bonusPoints: Number(config.bonusPoints),
      question: config.question,
      options: options.map((o) => o.label),
      hasAnswer: config.hasAnswer !== null,
    },
    ready: Boolean(config.videoUrl) && options.length === 4 && config.hasAnswer !== null,
    live: runs.find((r) => r.ended_at === null)?.id ?? null,
    runs: runs.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      bonusPoints: Number(r.bonus_points),
      teams: r.teams,
      playing: r.playing,
      correct: r.correct,
      wrong: r.wrong,
      skipped: r.skipped,
      open: r.open,
      paid: Number(r.paid),
    })),
  };
}

export async function saveSettings(input: FlashySettings, by: Actor): Promise<void> {
  const changes: Partial<typeof flashyConfig.$inferInsert> = {};
  if (input.videoUrl !== undefined) changes.videoUrl = input.videoUrl;
  if (input.videoSeconds !== undefined) changes.videoSeconds = input.videoSeconds;
  if (input.bonusPoints !== undefined) changes.bonusPoints = String(input.bonusPoints);
  if (input.correct !== undefined && input.wrong) {
    const labels = [input.correct, ...input.wrong].map((l) => l.trim());
    const options: FlashyOption[] = labels.map((label) => ({
      id: randomBytes(5).toString('hex'),
      label,
    }));
    changes.options = options;
    changes.answerHash = hashFlashyAnswer(input.correct);
  }
  await db.transaction(async (tx) => {
    await tx.update(flashyConfig).set(changes);
    await audit(tx, {
      ...by,
      action: 'flashy.config',
      entityType: 'flashy',
      // Field names only: the options and the answer stay out of the log.
      details: { fields: Object.keys(changes) },
    });
  });
}

export type TriggerResult =
  { result: 'started'; runId: string } | { result: 'live' } | { result: 'not_ready' };

// A copy of the settings goes into the run, so a later edit cannot change what teams were shown.
// The partial unique index makes a second live run impossible however many requests arrive.
export async function triggerRun(by: Actor): Promise<TriggerResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO app.flashy_runs
        (video_url, video_seconds, bonus_points, question, options, answer_hash, started_by)
      SELECT video_url, video_seconds, bonus_points, question, options, answer_hash, ${by.actorId}::uuid
      FROM app.flashy_config
      WHERE video_url IS NOT NULL AND answer_hash IS NOT NULL AND jsonb_array_length(options) = 4
        AND NOT EXISTS (SELECT 1 FROM app.flashy_runs WHERE ended_at IS NULL)
      ON CONFLICT DO NOTHING
      RETURNING id`);
    if (row) {
      await audit(tx, { ...by, action: 'flashy.trigger', entityType: 'flashy', entityId: row.id });
      return { result: 'started', runId: row.id } as const;
    }
    const [live] = await tx.execute<{ id: string }>(
      sql`SELECT id FROM app.flashy_runs WHERE ended_at IS NULL`,
    );
    return live ? ({ result: 'live' } as const) : ({ result: 'not_ready' } as const);
  });
}

// Taking the run's row lock waits for any answer in flight, and nothing is accepted after it.
export async function endRun(
  by: Actor,
): Promise<{ result: 'ended'; runId: string } | { result: 'none' }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      UPDATE app.flashy_runs SET ended_at = now(), ended_by = ${by.actorId}::uuid
      WHERE ended_at IS NULL RETURNING id`);
    if (!row) return { result: 'none' } as const;
    await audit(tx, { ...by, action: 'flashy.end', entityType: 'flashy', entityId: row.id });
    return { result: 'ended', runId: row.id } as const;
  });
}
