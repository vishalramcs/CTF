// Typing only. supabase/migrations/ is the source of truth for constraints and indexes.
// tests/integration/schema.test.ts fails if these columns drift from the database.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  inet,
  integer,
  jsonb,
  numeric,
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

export const teams = app.table('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isHidden: boolean('is_hidden').notNull().default(false),
  fullAccess: boolean('full_access').notNull().default(false),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const users = app.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  adminLevel: text('admin_level'),
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
  inboxTag: text('inbox_tag')
    .notNull()
    .default(sql`substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)`),
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
  basePoints: integer('base_points').notNull(),
  storyMd: text('story_md').notNull().default(''),
  questionTemplate: text('question_template').notNull().default(''),
  evidence: jsonb('evidence').notNull().default([]),
  generatorKey: text('generator_key').notNull().default('template'),
  generatorConfig: jsonb('generator_config').notNull().default({}),
  generatorVersion: integer('generator_version').notNull().default(1),
  requiresUnlock: boolean('requires_unlock').notNull().default(false),
  flagMode: text('flag_mode').notNull().default('team'),
  flagTemplate: text('flag_template'),
  staticFlagHash: text('static_flag_hash'),
  isPublished: boolean('is_published').notNull().default(false),
  // Identical for every team; shown to a team only after it solves this question.
  fragmentValue: text('fragment_value'),
  coordinateOrder: smallint('coordinate_order'),
  orderClue: text('order_clue'),
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

export const teamChallengeUnlocks = app.table('team_challenge_unlocks', {
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  source: text('source').notNull(),
  unlockedAt: timestamptz('unlocked_at').notNull().defaultNow(),
});

export const workspaceDeletions = app.table('workspace_deletions', {
  teamId: uuid('team_id').notNull(),
  workspace: text('workspace').notNull(),
  fileKey: text('file_key').notNull(),
  deletedAt: timestamptz('deleted_at').notNull().defaultNow(),
});

export const hintReveals = app.table('hint_reveals', {
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  hintOrder: smallint('hint_order').notNull(),
  revealedAt: timestamptz('revealed_at').notNull().defaultNow(),
});

export const eventState = app.table('event_state', {
  id: smallint('id').primaryKey().default(1),
  submissionsOpen: boolean('submissions_open').notNull().default(true),
  leaderboardFrozen: boolean('leaderboard_frozen').notNull().default(false),
  scoreboardVersion: bigint('scoreboard_version', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  status: text('status').notNull().default('not_started'),
  statusChangedAt: timestamptz('status_changed_at').notNull().defaultNow(),
  coordinateAnswerHash: text('coordinate_answer_hash'),
  coordinateAnswerEnc: text('coordinate_answer_enc'),
  coordinateWinnerId: uuid('coordinate_winner_id'),
  coordinateWonAt: timestamptz('coordinate_won_at'),
  freezeAt: timestamptz('freeze_at'),
  decoderReleased: boolean('decoder_released').notNull().default(false),
});

export const vaultKeys = app.table('vault_keys', {
  slot: smallint('slot').primaryKey(),
  valueEnc: text('value_enc').notNull(),
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

// Position and points are set by a database trigger (0003), not by the app.
export const solves = app.table('solves', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  // The trigger overwrites both columns on insert; the defaults only let the app omit them.
  solvePosition: integer('solve_position')
    .notNull()
    .default(sql`0`),
  pointsAwarded: numeric('points_awarded', { precision: 7, scale: 2 })
    .notNull()
    .default(sql`0`),
  solvedAt: timestamptz('solved_at').notNull().defaultNow(),
});

export const scoreTransactions = app.table('score_transactions', {
  id: identity('id').primaryKey(),
  teamId: uuid('team_id').notNull(),
  category: text('category').notNull(),
  points: numeric('points', { precision: 7, scale: 2 }).notNull(),
  refType: text('ref_type'),
  refId: uuid('ref_id'),
  reason: text('reason'),
  adminId: uuid('admin_id'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const finalCoordinates = app.table('final_coordinates', {
  position: smallint('position').primaryKey(),
  label: text('label').notNull().default(''),
  value: text('value').notNull(),
});

export const coordinateSubmissions = app.table('coordinate_submissions', {
  id: identity('id').primaryKey(),
  teamId: uuid('team_id').notNull(),
  submittedHash: text('submitted_hash').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const surpriseEvents = app.table('surprise_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  availableFrom: timestamptz('available_from'),
  availableUntil: timestamptz('available_until'),
  contentHtml: text('content_html').notNull().default(''),
  assetUrl: text('asset_url'),
  answerHash: text('answer_hash'),
  answerEnc: text('answer_enc'),
  points: numeric('points', { precision: 7, scale: 2 }).notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const surpriseProgress = app.table('surprise_progress', {
  teamId: uuid('team_id').notNull(),
  eventId: uuid('event_id').notNull(),
  discoveredAt: timestamptz('discovered_at').notNull().defaultNow(),
  completedAt: timestamptz('completed_at'),
});

export const surpriseSubmissions = app.table('surprise_submissions', {
  id: identity('id').primaryKey(),
  eventId: uuid('event_id').notNull(),
  teamId: uuid('team_id').notNull(),
  submittedHash: text('submitted_hash').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
});

export const announcements = app.table('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: text('message').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  expiresAt: timestamptz('expires_at'),
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

const points = (name: string) => numeric(name, { precision: 7, scale: 2 }).notNull();

export const vScoreboard = app
  .view('v_scoreboard', {
    teamId: uuid('team_id').notNull(),
    teamName: text('team_name').notNull(),
    isHidden: boolean('is_hidden').notNull(),
    isActive: boolean('is_active').notNull(),
    total: points('total'),
    challengePoints: points('challenge_points'),
    surprisePoints: points('surprise_points'),
    adjustmentPoints: points('adjustment_points'),
    lastScoreAt: timestamptz('last_score_at'),
    easySolved: integer('easy_solved').notNull(),
    mediumSolved: integer('medium_solved').notNull(),
    difficultSolved: integer('difficult_solved').notNull(),
    mainSolvedAt: timestamptz('main_solved_at'),
    coordinatesFoundAt: timestamptz('coordinates_found_at'),
    surprises: integer('surprises').notNull(),
    solves: integer('solves').notNull(),
    rankAll: integer('rank_all').notNull(),
  })
  .existing();

export const vPublicScoreboard = app
  .view('v_public_scoreboard', {
    rank: integer('rank').notNull(),
    teamName: text('team_name').notNull(),
    total: points('total'),
    easySolved: integer('easy_solved').notNull(),
    mediumSolved: integer('medium_solved').notNull(),
    difficultSolved: integer('difficult_solved').notNull(),
    mainDone: boolean('main_done').notNull(),
    coordinatesDone: boolean('coordinates_done').notNull(),
  })
  .existing();

export const vPublicFeed = app
  .view('v_public_feed', {
    occurredAt: timestamptz('occurred_at').notNull(),
    kind: text('kind').notNull(),
    teamName: text('team_name').notNull(),
    challengeNumber: integer('challenge_number'),
    challengeTitle: text('challenge_title'),
    pointsAwarded: numeric('points_awarded', { precision: 7, scale: 2 }),
  })
  .existing();
