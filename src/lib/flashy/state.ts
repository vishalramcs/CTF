import { sql } from 'drizzle-orm';

import { hmacHex, safeEqual } from '@/lib/crypto/hmac';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { notifyBoard } from '@/lib/realtime/broadcast';

import {
  FINISH_TOLERANCE_SECONDS,
  PLAYBACK_LIMIT,
  type FlashyOption,
  type FlashyTeamState,
} from './shared';

// The stored form of an answer: whoever configures one must hash it with this too.
export function hashFlashyAnswer(label: string): string {
  return hmacHex(env.FLAG_HMAC_KEY, `flashy:${label.trim().toLowerCase()}`);
}

// A fixed order per team and run (so a refresh keeps it), different between teams.
function shuffled(options: FlashyOption[], runId: string, teamId: string): FlashyOption[] {
  const key = (o: FlashyOption) =>
    hmacHex(env.VARIANT_HMAC_KEY, `flashy:${runId}:${teamId}:${o.id}`);
  return [...options].sort((a, b) => key(a).localeCompare(key(b)));
}

type Row = {
  id: string;
  video_seconds: number;
  question: string;
  options: FlashyOption[];
  playbacks: number | null;
  state: 'open' | 'answered' | 'skipped' | null;
  is_correct: boolean | null;
  watched: boolean | null;
};

// What this team may see. The options appear only once the server's clock says the video can have
// finished, and nothing here says which one is right.
export async function getTeamState(teamId: string): Promise<FlashyTeamState> {
  const [row] = await db.execute<Row>(sql`
    SELECT r.id, r.video_seconds, r.question, r.options, p.playbacks, p.state, p.is_correct,
           (p.last_playback_at IS NOT NULL
             AND now() >= p.last_playback_at
                          + make_interval(secs => greatest(r.video_seconds - ${FINISH_TOLERANCE_SECONDS}, 0))
           ) AS watched
    FROM app.flashy_runs r
    LEFT JOIN app.flashy_participation p ON p.run_id = r.id AND p.team_id = ${teamId}
    WHERE r.ended_at IS NULL`);
  if (!row) return { active: false };

  const done = row.state === 'answered' || row.state === 'skipped';
  const phase = done ? 'done' : row.watched ? 'quiz' : 'watch';
  return {
    active: true,
    runId: row.id,
    phase,
    playbacksLeft: Math.max(PLAYBACK_LIMIT - (row.playbacks ?? 0), 0),
    videoSeconds: row.video_seconds,
    question: row.question,
    options: phase === 'quiz' ? shuffled(row.options, row.id, teamId) : [],
    outcome:
      row.state === 'skipped'
        ? 'skipped'
        : row.state === 'answered'
          ? row.is_correct
            ? 'correct'
            : 'wrong'
          : null,
  };
}

export type PlaybackResult =
  | { result: 'ok'; videoUrl: string; videoSeconds: number; playbacksLeft: number }
  | { result: 'none' }
  | { result: 'limit' }
  | { result: 'finished' };

// One statement, so two requests at once cannot both take the last playback: the row is locked by
// the upsert and the WHERE is checked against its current value. FOR SHARE on the run makes
// ending it wait for this commit.
export async function authorizePlayback(teamId: string): Promise<PlaybackResult> {
  const [granted] = await db.execute<{
    playbacks: number;
    video_url: string;
    video_seconds: number;
  }>(sql`
    WITH run AS (
      SELECT id, video_url, video_seconds FROM app.flashy_runs WHERE ended_at IS NULL FOR SHARE
    ), ins AS (
      INSERT INTO app.flashy_participation AS p (run_id, team_id, playbacks, last_playback_at)
      SELECT id, ${teamId}::uuid, 1, now() FROM run
      ON CONFLICT (run_id, team_id) DO UPDATE
        SET playbacks = p.playbacks + 1, last_playback_at = now()
        WHERE p.state = 'open' AND p.playbacks < ${PLAYBACK_LIMIT}
      RETURNING playbacks
    )
    SELECT ins.playbacks, run.video_url, run.video_seconds FROM ins CROSS JOIN run`);
  if (granted) {
    return {
      result: 'ok',
      videoUrl: granted.video_url,
      videoSeconds: granted.video_seconds,
      playbacksLeft: PLAYBACK_LIMIT - granted.playbacks,
    };
  }
  // Refused: say why. A second read is fine, nothing here can be gained by racing it.
  const [why] = await db.execute<{ state: string | null }>(sql`
    SELECT p.state FROM app.flashy_runs r
    LEFT JOIN app.flashy_participation p ON p.run_id = r.id AND p.team_id = ${teamId}
    WHERE r.ended_at IS NULL`);
  if (!why) return { result: 'none' };
  return why.state && why.state !== 'open' ? { result: 'finished' } : { result: 'limit' };
}

export type AnswerResult =
  | { result: 'correct' | 'wrong'; bonus: number }
  | { result: 'none' }
  | { result: 'not_ready' }
  | { result: 'already_done' }
  | { result: 'bad_option' };

// One attempt per team: a wrong answer ends it, so the four options cannot be tried in turn.
// Lock order is run (shared) then the team's row, the same as everything else here.
export async function submitAnswer(teamId: string, optionId: string): Promise<AnswerResult> {
  const result = await db.transaction(async (tx): Promise<AnswerResult> => {
    const [run] = await tx.execute<{
      id: string;
      answer_hash: string;
      options: FlashyOption[];
      bonus_points: string;
    }>(sql`SELECT id, answer_hash, options, bonus_points FROM app.flashy_runs
           WHERE ended_at IS NULL FOR SHARE`);
    if (!run) return { result: 'none' };

    const [part] = await tx.execute<{ state: string; playbacks: number; watched: boolean }>(sql`
      SELECT p.state, p.playbacks,
             (p.last_playback_at IS NOT NULL
               AND now() >= p.last_playback_at
                            + make_interval(secs => greatest(r.video_seconds - ${FINISH_TOLERANCE_SECONDS}, 0))
             ) AS watched
      FROM app.flashy_participation p JOIN app.flashy_runs r ON r.id = p.run_id
      WHERE p.run_id = ${run.id} AND p.team_id = ${teamId} FOR UPDATE OF p`);
    if (!part || part.playbacks < 1 || !part.watched) {
      return part?.state && part.state !== 'open'
        ? { result: 'already_done' }
        : { result: 'not_ready' };
    }
    if (part.state !== 'open') return { result: 'already_done' };

    const option = run.options.find((o) => o.id === optionId);
    if (!option) return { result: 'bad_option' };

    const correct = safeEqual(hashFlashyAnswer(option.label), run.answer_hash);
    const bonus = correct ? Number(run.bonus_points) : 0;
    await tx.execute(sql`
      UPDATE app.flashy_participation
      SET state = 'answered', chosen_option = ${option.id}, is_correct = ${correct},
          points_awarded = ${bonus}, finished_at = now()
      WHERE run_id = ${run.id} AND team_id = ${teamId}`);
    // The ledger's unique (team, ref_type, ref_id) index is the last guard against a second payment.
    if (bonus > 0) {
      await tx.execute(sql`
        INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id)
        VALUES (${teamId}, 'surprise', ${bonus}, 'flashy_run', ${run.id})
        ON CONFLICT DO NOTHING`);
    }
    return { result: correct ? 'correct' : 'wrong', bonus };
  });
  if (result.result === 'correct' && result.bonus > 0) await notifyBoard(); // after the commit
  return result;
}

export type SkipResult = { result: 'skipped' } | { result: 'none' } | { result: 'already_done' };

export async function skipEvent(teamId: string): Promise<SkipResult> {
  const [row] = await db.execute<{ state: string }>(sql`
    WITH run AS (SELECT id FROM app.flashy_runs WHERE ended_at IS NULL FOR SHARE), ins AS (
      INSERT INTO app.flashy_participation AS p (run_id, team_id, state, finished_at)
      SELECT id, ${teamId}::uuid, 'skipped', now() FROM run
      ON CONFLICT (run_id, team_id) DO UPDATE SET state = 'skipped', finished_at = now()
        WHERE p.state = 'open'
      RETURNING state
    )
    SELECT state FROM ins`);
  if (row) return { result: 'skipped' };
  const [live] = await db.execute<{ id: string }>(
    sql`SELECT id FROM app.flashy_runs WHERE ended_at IS NULL`,
  );
  return live ? { result: 'already_done' } : { result: 'none' };
}
