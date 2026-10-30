// Typing only. supabase/migrations/ is the source of truth for constraints and indexes.
// tests/integration/schema.test.ts fails if these columns drift from the database.
import {
  bigint,
  boolean,
  char,
  inet,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const app = pgSchema('app');

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const identity = (name: string) => bigint(name, { mode: 'number' }).generatedAlwaysAsIdentity();

export const userRole = app.enum('user_role', ['admin', 'team']);
export const challengeDifficulty = app.enum('challenge_difficulty', [
  'easy',
  'medium',
  'difficult',
  'main_difficult',
]);
export const eventPhase = app.enum('event_phase', ['onboarding', 'main_ctf', 'ai_mode', 'finale']);
export const surpriseType = app.enum('surprise_type', ['flash_spidey', 'spidey_mutation']);
export const surpriseStatus = app.enum('surprise_status', ['draft', 'active', 'closed']);
export const morseStatus = app.enum('morse_status', [
  'draft',
  'active',
  'paused',
  'stopped',
  'expired',
]);

export const teams = app.table('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const users = app.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  teamId: uuid('team_id'),
  isActive: boolean('is_active').notNull().default(true),
  passwordChangedAt: timestamptz('password_changed_at').notNull().defaultNow(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const sessions = app.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  role: userRole('role').notNull(),
  teamId: uuid('team_id'),
  tokenHash: text('token_hash').notNull(),
  inboxTag: text('inbox_tag').notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
  expiresAt: timestamptz('expires_at').notNull(),
  revokedAt: timestamptz('revoked_at'),
  revokeReason: text('revoke_reason'),
});

export const loginAttempts = app.table('login_attempts', {
  id: identity('id').primaryKey(),
  username: text('username').notNull(),
  ip: inet('ip'),
  success: boolean('success').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const challenges = app.table('challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: integer('number').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  difficulty: challengeDifficulty('difficulty').notNull(),
  category: text('category').notNull(),
  isPractice: boolean('is_practice').notNull().default(false),
  basePoints: integer('base_points').notNull(),
  aiPoints: integer('ai_points').notNull(),
  storyMd: text('story_md').notNull().default(''),
  questionTemplate: text('question_template').notNull().default(''),
  evidence: jsonb('evidence').notNull().default([]),
  generatorKey: text('generator_key').notNull().default('template'),
  generatorConfig: jsonb('generator_config').notNull().default({}),
  generatorVersion: integer('generator_version').notNull().default(1),
  flagMode: text('flag_mode').notNull().default('team'),
  flagTemplate: text('flag_template'),
  staticFlagHash: text('static_flag_hash'),
  hasFragment: boolean('has_fragment').notNull().default(false),
  fragmentValue: text('fragment_value'),
  coordinateOrder: smallint('coordinate_order'),
  orderClue: text('order_clue'),
  isPublished: boolean('is_published').notNull().default(false),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const challengeHints = app.table('challenge_hints', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull(),
  hintOrder: smallint('hint_order').notNull(),
  contentMd: text('content_md').notNull(),
});

export const challengeAssets = app.table('challenge_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull(),
  name: text('name').notNull(),
  storageBucket: text('storage_bucket').notNull(),
  storagePath: text('storage_path').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  isPerTeam: boolean('is_per_team').notNull().default(false),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const teamChallengeVariants = app.table('team_challenge_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  variantData: jsonb('variant_data').notNull(),
  expectedFlagHash: text('expected_flag_hash').notNull(),
  generatorVersion: integer('generator_version').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const hintReveals = app.table('hint_reveals', {
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  hintOrder: smallint('hint_order').notNull(),
  revealedAt: timestamptz('revealed_at').notNull().defaultNow(),
});

export const eventState = app.table('event_state', {
  id: smallint('id').primaryKey().default(1),
  phase: eventPhase('phase').notNull().default('onboarding'),
  phaseStartedAt: timestamptz('phase_started_at').notNull().defaultNow(),
  phaseEndsAt: timestamptz('phase_ends_at'),
  submissionsOpen: boolean('submissions_open').notNull().default(true),
  leaderboardFrozen: boolean('leaderboard_frozen').notNull().default(false),
  coordinatesOpen: boolean('coordinates_open').notNull().default(true),
  coordinatesLocked: boolean('coordinates_locked').notNull().default(false),
  coordinateWinnerId: uuid('coordinate_winner_id'),
  coordinateWonAt: timestamptz('coordinate_won_at'),
  coordinateAnswerHash: text('coordinate_answer_hash'),
  coordinateHemisphereLat: char('coordinate_hemisphere_lat', { length: 1 }).notNull().default('N'),
  coordinateHemisphereLon: char('coordinate_hemisphere_lon', { length: 1 }).notNull().default('E'),
  finalTraceEnc: text('final_trace_enc'),
  winnerBonusPoints: integer('winner_bonus_points').notNull().default(300),
  finaleStartedAt: timestamptz('finale_started_at'),
  scoreboardVersion: bigint('scoreboard_version', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const broadcastGate = app.table('broadcast_gate', {
  topic: text('topic').primaryKey(),
  lastSentAt: timestamptz('last_sent_at').notNull(),
});

export const submissions = app.table('submissions', {
  id: identity('id').primaryKey(),
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  sessionId: uuid('session_id'),
  submittedHash: text('submitted_hash').notNull(),
  submittedPreview: text('submitted_preview'),
  isCorrect: boolean('is_correct').notNull(),
  result: text('result').notNull(),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const solves = app.table('solves', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  pointsAwarded: integer('points_awarded').notNull(),
  phase: eventPhase('phase').notNull(),
  solvedAt: timestamptz('solved_at').notNull().defaultNow(),
});

export const coordinateSubmissions = app.table('coordinate_submissions', {
  id: identity('id').primaryKey(),
  teamId: uuid('team_id').notNull(),
  sessionId: uuid('session_id'),
  submittedHash: text('submitted_hash').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const winners = app.table('winners', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  winnerType: text('winner_type').notNull(),
  bonusPoints: integer('bonus_points').notNull().default(0),
  awardedAt: timestamptz('awarded_at').notNull().defaultNow(),
});

export const surpriseEvents = app.table('surprise_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: surpriseType('type').notNull(),
  title: text('title').notNull(),
  contentHtml: text('content_html').notNull().default(''),
  assetUrl: text('asset_url'),
  showMs: integer('show_ms'),
  answerHash: text('answer_hash').notNull(),
  answerEnc: text('answer_enc'),
  points: integer('points').notNull().default(50),
  maxWinners: integer('max_winners'),
  targetAll: boolean('target_all').notNull().default(true),
  status: surpriseStatus('status').notNull().default('draft'),
  startsAt: timestamptz('starts_at'),
  expiresAt: timestamptz('expires_at'),
  createdBy: uuid('created_by'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  closedAt: timestamptz('closed_at'),
});

export const surpriseTargets = app.table('surprise_targets', {
  eventId: uuid('event_id').notNull(),
  teamId: uuid('team_id').notNull(),
});

export const surpriseSubmissions = app.table('surprise_submissions', {
  id: identity('id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  teamId: uuid('team_id').notNull(),
  submittedHash: text('submitted_hash').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const spiderSignalCodes = app.table('spider_signal_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  codeHash: text('code_hash').notNull(),
  points: integer('points').notNull().default(50),
  expiresAt: timestamptz('expires_at').notNull(),
  revealedAt: timestamptz('revealed_at'),
  redeemedAt: timestamptz('redeemed_at'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  triggeredBy: uuid('triggered_by'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const spiderSignalAttempts = app.table('spider_signal_attempts', {
  id: identity('id').primaryKey(),
  signalId: uuid('signal_id').notNull(),
  teamId: uuid('team_id').notNull(),
  submittedHash: text('submitted_hash').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const morseTransmissions = app.table('morse_transmissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  digitsHash: text('digits_hash').notNull(),
  digitsEnc: text('digits_enc').notNull(),
  digitCount: smallint('digit_count').notNull(),
  unitMs: integer('unit_ms').notNull().default(300),
  timeline: jsonb('timeline'),
  cycleMs: integer('cycle_ms'),
  points: integer('points').notNull().default(100),
  targetAll: boolean('target_all').notNull().default(true),
  status: morseStatus('status').notNull().default('draft'),
  durationSec: integer('duration_sec').notNull().default(300),
  startedAt: timestamptz('started_at'),
  pausedAt: timestamptz('paused_at'),
  pausedTotalMs: bigint('paused_total_ms', { mode: 'number' }).notNull().default(0),
  expiresAt: timestamptz('expires_at'),
  createdBy: uuid('created_by'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const morseTargets = app.table('morse_targets', {
  transmissionId: uuid('transmission_id').notNull(),
  teamId: uuid('team_id').notNull(),
});

export const morseSubmissions = app.table('morse_submissions', {
  id: identity('id').primaryKey(),
  transmissionId: uuid('transmission_id').notNull(),
  teamId: uuid('team_id').notNull(),
  submittedHash: text('submitted_hash').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const scoreAdjustments = app.table('score_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  adminId: uuid('admin_id').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const auditLog = app.table('audit_log', {
  id: identity('id').primaryKey(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: jsonb('details').notNull().default({}),
  ip: inet('ip'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const scoreboardSnapshots = app.table('scoreboard_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshot: jsonb('snapshot').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const vScoreboard = app
  .view('v_scoreboard', {
    teamId: uuid('team_id').notNull(),
    teamName: text('team_name').notNull(),
    isHidden: boolean('is_hidden').notNull(),
    isActive: boolean('is_active').notNull(),
    total: integer('total').notNull(),
    challengePoints: integer('challenge_points').notNull(),
    bonusPoints: integer('bonus_points').notNull(),
    adjustmentPoints: integer('adjustment_points').notNull(),
    winnerPoints: integer('winner_points').notNull(),
    lastScoreAt: timestamptz('last_score_at'),
    solves: integer('solves').notNull(),
    rankAll: integer('rank_all').notNull(),
  })
  .existing();

export const vPublicScoreboard = app
  .view('v_public_scoreboard', {
    rank: integer('rank').notNull(),
    teamId: uuid('team_id').notNull(),
    teamName: text('team_name').notNull(),
    total: integer('total').notNull(),
    solves: integer('solves').notNull(),
    lastScoreAt: timestamptz('last_score_at'),
  })
  .existing();

export const vPublicFeed = app
  .view('v_public_feed', {
    solvedAt: timestamptz('solved_at').notNull(),
    teamName: text('team_name').notNull(),
    challengeNumber: integer('challenge_number').notNull(),
    challengeTitle: text('challenge_title').notNull(),
    pointsAwarded: integer('points_awarded').notNull(),
  })
  .existing();
