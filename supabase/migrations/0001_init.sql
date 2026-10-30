-- =====================================================================
-- SPIDEY tracXer — 0001_init.sql
-- Schema `app` (NOT exposed via the Supabase Data API). All access goes
-- through the Next.js server. See docs/05-Backend-Schema.md.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- ---------- Enums ----------
CREATE TYPE app.user_role            AS ENUM ('admin', 'team');
CREATE TYPE app.challenge_difficulty AS ENUM ('easy', 'medium', 'difficult', 'main_difficult');
CREATE TYPE app.event_phase          AS ENUM ('onboarding', 'main_ctf', 'ai_mode', 'finale');
CREATE TYPE app.surprise_type        AS ENUM ('flash_spidey', 'spidey_mutation');
CREATE TYPE app.surprise_status      AS ENUM ('draft', 'active', 'closed');
CREATE TYPE app.morse_status         AS ENUM ('draft', 'active', 'paused', 'stopped', 'expired');

-- ---------- updated_at helper ----------
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- =====================================================================
-- Identity
-- =====================================================================
CREATE TABLE app.teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  is_hidden   boolean NOT NULL DEFAULT false,      -- test teams: excluded from public board
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_len CHECK (char_length(name) BETWEEN 2 AND 40)
);
CREATE UNIQUE INDEX teams_name_uq ON app.teams (lower(name));
CREATE UNIQUE INDEX teams_slug_uq ON app.teams (slug);

CREATE TABLE app.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username           text NOT NULL,
  password_hash      text NOT NULL,                 -- argon2id encoded string
  role               app.user_role NOT NULL,
  team_id            uuid UNIQUE REFERENCES app.teams(id) ON DELETE CASCADE,
  is_active          boolean NOT NULL DEFAULT true,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_team CHECK (
    (role = 'admin' AND team_id IS NULL) OR (role = 'team' AND team_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX users_username_uq ON app.users (lower(username));

-- One table for admin + team sessions. Team cap (MAX_SESSIONS_PER_TEAM, default 2)
-- is enforced in the login transaction under an advisory lock (see TRD §5.2).
CREATE TABLE app.sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role           app.user_role NOT NULL,
  team_id        uuid REFERENCES app.teams(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,               -- sha256(token || SESSION_PEPPER), hex
  inbox_tag      text NOT NULL DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),  -- opaque ping routing tag (core fn, no pgcrypto needed)
  ip             inet,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoke_reason  text,
  CONSTRAINT sessions_role_team CHECK (
    (role = 'admin' AND team_id IS NULL) OR (role = 'team' AND team_id IS NOT NULL)
  ),
  CONSTRAINT sessions_revoke_reason CHECK (
    revoke_reason IS NULL OR revoke_reason IN ('evicted', 'logout', 'admin', 'password_reset', 'team_disabled')
  )
);
CREATE INDEX sessions_active_team_idx ON app.sessions (team_id, created_at) WHERE revoked_at IS NULL;
CREATE INDEX sessions_user_idx        ON app.sessions (user_id);

CREATE TABLE app.login_attempts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username    text NOT NULL,
  ip          inet,
  success     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_user_idx ON app.login_attempts (lower(username), created_at DESC);
CREATE INDEX login_attempts_ip_idx   ON app.login_attempts (ip, created_at DESC);

-- =====================================================================
-- Challenges
-- =====================================================================
CREATE TABLE app.challenges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number             integer NOT NULL UNIQUE,         -- 0 = practice, 1..10 = real
  slug               text NOT NULL UNIQUE,
  title              text NOT NULL,
  difficulty         app.challenge_difficulty NOT NULL,
  category           text NOT NULL,                   -- base64, hex, url, inspect, exif, logs, hash, headers, cipher, multi
  is_practice        boolean NOT NULL DEFAULT false,
  base_points        integer NOT NULL,
  ai_points          integer NOT NULL,
  story_md           text NOT NULL DEFAULT '',
  question_template  text NOT NULL DEFAULT '',        -- HTML with {{var}} placeholders
  evidence           jsonb NOT NULL DEFAULT '[]',     -- ordered blocks: {type:'code'|'image'|'file'|'log'|'text', ...}
  -- Questions are written by the organisers. Per-team values come from template
  -- placeholders ({{flag|base64}}, {{token}}, ...) or a built-in generator.
  generator_key      text NOT NULL DEFAULT 'template', -- 'template' | 'exif-image' | 'log-file' | 'placeholder'
  generator_config   jsonb NOT NULL DEFAULT '{}',
  generator_version  integer NOT NULL DEFAULT 1,      -- bump to force variant regeneration
  flag_mode          text NOT NULL DEFAULT 'team' CHECK (flag_mode IN ('team', 'static')),
  flag_template      text,                            -- team mode: inner part, e.g. '{{fragment}}_{{token}}'
  static_flag_hash   text,                            -- static mode: HMAC of the organiser's fixed flag (same for all teams)
  has_fragment       boolean NOT NULL DEFAULT false,
  fragment_value     text,                            -- 2 digits, IDENTICAL for all teams
  coordinate_order   smallint,                        -- 1..6, hidden from participants
  order_clue         text,                            -- shown only after solving
  is_published       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenges_number_range CHECK (number BETWEEN 0 AND 10),
  CONSTRAINT challenges_points_nonneg CHECK (base_points >= 0 AND ai_points >= 0 AND ai_points <= base_points),
  CONSTRAINT challenges_fragment_shape CHECK (
    has_fragment = (fragment_value IS NOT NULL AND coordinate_order IS NOT NULL)
  ),
  CONSTRAINT challenges_fragment_digits CHECK (fragment_value IS NULL OR fragment_value ~ '^[0-9]{2}$'),
  CONSTRAINT challenges_order_range CHECK (coordinate_order IS NULL OR coordinate_order BETWEEN 1 AND 6),
  CONSTRAINT challenges_practice_shape CHECK (
    NOT is_practice OR (number = 0 AND base_points = 0 AND ai_points = 0 AND NOT has_fragment)
  ),
  CONSTRAINT challenges_practice_number CHECK ((number = 0) = is_practice),
  CONSTRAINT challenges_flag_mode_shape CHECK (
    (flag_mode = 'team'   AND flag_template IS NOT NULL AND static_flag_hash IS NULL) OR
    (flag_mode = 'static' AND static_flag_hash IS NOT NULL AND flag_template IS NULL)
  ),
  CONSTRAINT challenges_template_has_token CHECK (
    flag_mode <> 'team' OR position('{{token}}' IN flag_template) > 0
  )
);
CREATE UNIQUE INDEX challenges_coordinate_order_uq ON app.challenges (coordinate_order) WHERE coordinate_order IS NOT NULL;
CREATE TRIGGER challenges_touch BEFORE UPDATE ON app.challenges
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE app.challenge_hints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  hint_order    smallint NOT NULL,
  content_md    text NOT NULL,
  UNIQUE (challenge_id, hint_order)
);

CREATE TABLE app.challenge_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  name            text NOT NULL,                    -- referenced in evidence blocks
  storage_bucket  text NOT NULL CHECK (storage_bucket IN ('challenge-assets', 'private-assets')),
  storage_path    text NOT NULL,
  content_type    text NOT NULL,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  is_per_team     boolean NOT NULL DEFAULT false,   -- true: generated per team at request time
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, name)
);

-- Change #1: NO fragment column here. Fragment always comes from app.challenges.
CREATE TABLE app.team_challenge_variants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id        uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  variant_data        jsonb NOT NULL,               -- rendered values + inspect surfaces (encoded forms only)
  expected_flag_hash  text NOT NULL,                -- HMAC(FLAG_HMAC_KEY, normalized flag), hex
  generator_version   integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, challenge_id)
);
CREATE INDEX tcv_challenge_idx ON app.team_challenge_variants (challenge_id);

CREATE TABLE app.hint_reveals (
  team_id       uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id  uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  hint_order    smallint NOT NULL,
  revealed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, challenge_id, hint_order)
);

-- =====================================================================
-- Event state (singleton)
-- =====================================================================
CREATE TABLE app.event_state (
  id                       smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phase                    app.event_phase NOT NULL DEFAULT 'onboarding',
  phase_started_at         timestamptz NOT NULL DEFAULT now(),
  phase_ends_at            timestamptz,                -- display only (countdowns)
  submissions_open         boolean NOT NULL DEFAULT true,
  leaderboard_frozen       boolean NOT NULL DEFAULT false,
  coordinates_open         boolean NOT NULL DEFAULT true,
  coordinates_locked       boolean NOT NULL DEFAULT false,
  coordinate_winner_id     uuid REFERENCES app.teams(id),
  coordinate_won_at        timestamptz,
  coordinate_answer_hash   text,                       -- HMAC(COORD_HMAC_KEY, canonical)
  coordinate_hemisphere_lat char(1) NOT NULL DEFAULT 'N' CHECK (coordinate_hemisphere_lat IN ('N','S')),
  coordinate_hemisphere_lon char(1) NOT NULL DEFAULT 'E' CHECK (coordinate_hemisphere_lon IN ('E','W')),
  final_trace_enc          text,                       -- AES-256-GCM(REVEAL_ENC_KEY) JSON {coords, place, text, imageUrl}
  winner_bonus_points      integer NOT NULL DEFAULT 300 CHECK (winner_bonus_points >= 0),
  finale_started_at        timestamptz,
  scoreboard_version       bigint NOT NULL DEFAULT 0,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_winner_consistency CHECK (
    (coordinates_locked AND coordinate_winner_id IS NOT NULL AND coordinate_won_at IS NOT NULL)
    OR (NOT coordinates_locked AND coordinate_winner_id IS NULL)
  )
);
INSERT INTO app.event_state (id) VALUES (1);
CREATE TRIGGER event_state_touch BEFORE UPDATE ON app.event_state
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Broadcast coalescing gate (TRD §6.4)
CREATE TABLE app.broadcast_gate (
  topic         text PRIMARY KEY,
  last_sent_at  timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO app.broadcast_gate (topic) VALUES ('board');

-- Returns true if caller may broadcast now (at most once per p_window).
CREATE OR REPLACE FUNCTION app.try_open_gate(p_topic text, p_window interval DEFAULT interval '1 second')
RETURNS boolean LANGUAGE sql AS $$
  WITH upd AS (
    UPDATE app.broadcast_gate
       SET last_sent_at = now()
     WHERE topic = p_topic AND last_sent_at < now() - p_window
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

-- =====================================================================
-- Flag attempts and solves
-- =====================================================================
CREATE TABLE app.submissions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id            uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id       uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  session_id         uuid REFERENCES app.sessions(id) ON DELETE SET NULL,
  submitted_hash     text NOT NULL,                 -- HMAC of normalized input ('' if malformed)
  submitted_preview  text,                          -- first 12 chars of WRONG attempts only (admin monitor); purged after event
  is_correct         boolean NOT NULL,
  result             text NOT NULL CHECK (result IN ('correct', 'wrong', 'malformed')),
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submissions_preview_only_wrong CHECK (NOT is_correct OR submitted_preview IS NULL)
);
CREATE INDEX submissions_ratelimit_idx ON app.submissions (team_id, challenge_id, submitted_at DESC) WHERE NOT is_correct;
CREATE INDEX submissions_time_idx      ON app.submissions (submitted_at DESC);

CREATE TABLE app.solves (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id    uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  points_awarded  integer NOT NULL CHECK (points_awarded >= 0),
  phase           app.event_phase NOT NULL CHECK (phase IN ('onboarding', 'main_ctf', 'ai_mode')),
  solved_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, challenge_id)
);
CREATE INDEX solves_time_idx ON app.solves (solved_at DESC);
CREATE INDEX solves_challenge_idx ON app.solves (challenge_id);

-- =====================================================================
-- Coordinates
-- =====================================================================
CREATE TABLE app.coordinate_submissions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES app.sessions(id) ON DELETE SET NULL,
  submitted_hash  text NOT NULL,
  is_correct      boolean NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coord_sub_ratelimit_idx ON app.coordinate_submissions (team_id, submitted_at DESC) WHERE NOT is_correct;
-- Belt and braces: at most ONE correct coordinate submission can ever exist.
CREATE UNIQUE INDEX coord_sub_single_winner_uq ON app.coordinate_submissions ((true)) WHERE is_correct;

CREATE TABLE app.winners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  winner_type   text NOT NULL CHECK (winner_type IN ('coordinates')),
  bonus_points  integer NOT NULL DEFAULT 0 CHECK (bonus_points >= 0),
  awarded_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (winner_type)
);

-- =====================================================================
-- Surprises: Flash Spidey + Spidey Mutation
-- =====================================================================
CREATE TABLE app.surprise_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          app.surprise_type NOT NULL,
  title         text NOT NULL,
  content_html  text NOT NULL DEFAULT '',           -- question/puzzle; served only via /api/me/pending when active
  asset_url     text,                               -- flash visual (public, non-secret)
  show_ms       integer CHECK (show_ms IS NULL OR show_ms BETWEEN 1000 AND 8000),
  answer_hash   text NOT NULL,                      -- HMAC(FLAG_HMAC_KEY, 'surprise:'||normalized)
  answer_enc    text,                               -- AES-GCM so admin can view
  points        integer NOT NULL DEFAULT 50 CHECK (points >= 0),
  max_winners   integer CHECK (max_winners IS NULL OR max_winners > 0),
  target_all    boolean NOT NULL DEFAULT true,
  status        app.surprise_status NOT NULL DEFAULT 'draft',
  starts_at     timestamptz,
  expires_at    timestamptz,
  created_by    uuid REFERENCES app.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz
);
CREATE INDEX surprise_active_idx ON app.surprise_events (status, expires_at);

CREATE TABLE app.surprise_targets (
  event_id  uuid NOT NULL REFERENCES app.surprise_events(id) ON DELETE CASCADE,
  team_id   uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, team_id)
);

CREATE TABLE app.surprise_submissions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        uuid NOT NULL REFERENCES app.surprise_events(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  submitted_hash  text NOT NULL,
  is_correct      boolean NOT NULL,
  points_awarded  integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surprise_points_only_correct CHECK (is_correct OR points_awarded = 0)
);
CREATE UNIQUE INDEX surprise_sub_one_correct_uq ON app.surprise_submissions (event_id, team_id) WHERE is_correct;
CREATE INDEX surprise_sub_ratelimit_idx ON app.surprise_submissions (team_id, event_id, submitted_at DESC) WHERE NOT is_correct;

-- =====================================================================
-- Spidey Signal (one random team per activation)
-- =====================================================================
CREATE TABLE app.spider_signal_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  code_hash       text NOT NULL,                    -- HMAC of derived code; plaintext never stored
  points          integer NOT NULL DEFAULT 50 CHECK (points >= 0),
  expires_at      timestamptz NOT NULL,
  revealed_at     timestamptz,
  redeemed_at     timestamptz,
  points_awarded  integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  triggered_by    uuid REFERENCES app.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_points_only_redeemed CHECK (redeemed_at IS NOT NULL OR points_awarded = 0)
);
CREATE INDEX signal_team_idx ON app.spider_signal_codes (team_id, created_at DESC);

CREATE TABLE app.spider_signal_attempts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  signal_id       uuid NOT NULL REFERENCES app.spider_signal_codes(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  submitted_hash  text NOT NULL,
  is_correct      boolean NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signal_attempt_ratelimit_idx ON app.spider_signal_attempts (team_id, signal_id, submitted_at DESC) WHERE NOT is_correct;

-- =====================================================================
-- Morse transmissions
-- =====================================================================
CREATE TABLE app.morse_transmissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digits_hash      text NOT NULL,                  -- HMAC(FLAG_HMAC_KEY, 'morse:'||digits)
  digits_enc       text NOT NULL,                  -- AES-GCM so admin can view
  digit_count      smallint NOT NULL CHECK (digit_count BETWEEN 1 AND 20),
  unit_ms          integer NOT NULL DEFAULT 300 CHECK (unit_ms BETWEEN 200 AND 1000),
  timeline         jsonb,                          -- [onMs, offMs, onMs, ...] computed at start
  cycle_ms         integer,
  points           integer NOT NULL DEFAULT 100 CHECK (points >= 0),
  target_all       boolean NOT NULL DEFAULT true,
  status           app.morse_status NOT NULL DEFAULT 'draft',
  duration_sec     integer NOT NULL DEFAULT 300 CHECK (duration_sec BETWEEN 30 AND 3600),
  started_at       timestamptz,
  paused_at        timestamptz,
  paused_total_ms  bigint NOT NULL DEFAULT 0,
  expires_at       timestamptz,                    -- started_at + duration + paused_total
  created_by       uuid REFERENCES app.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT morse_started_shape CHECK (
    status = 'draft' OR (started_at IS NOT NULL AND timeline IS NOT NULL AND cycle_ms IS NOT NULL)
  ),
  CONSTRAINT morse_paused_shape CHECK ((status = 'paused') = (paused_at IS NOT NULL))
);

CREATE TABLE app.morse_targets (
  transmission_id  uuid NOT NULL REFERENCES app.morse_transmissions(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  PRIMARY KEY (transmission_id, team_id)
);

-- Plan's UNIQUE(transmission_id, team_id) replaced: all attempts are logged,
-- uniqueness applies to the CORRECT one only.
CREATE TABLE app.morse_submissions (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transmission_id  uuid NOT NULL REFERENCES app.morse_transmissions(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  submitted_hash   text NOT NULL,
  is_correct       boolean NOT NULL,
  points_awarded   integer NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT morse_points_only_correct CHECK (is_correct OR points_awarded = 0)
);
CREATE UNIQUE INDEX morse_sub_one_correct_uq ON app.morse_submissions (transmission_id, team_id) WHERE is_correct;
CREATE INDEX morse_sub_ratelimit_idx ON app.morse_submissions (team_id, transmission_id, submitted_at DESC) WHERE NOT is_correct;

-- =====================================================================
-- Admin actions
-- =====================================================================
CREATE TABLE app.score_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  points      integer NOT NULL CHECK (points <> 0),
  reason      text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  admin_id    uuid NOT NULL REFERENCES app.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_adj_team_idx ON app.score_adjustments (team_id);

CREATE TABLE app.audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid REFERENCES app.users(id) ON DELETE SET NULL,
  action       text NOT NULL,                        -- e.g. 'phase.change', 'team.reset_password', 'coord.win'
  entity_type  text NOT NULL,
  entity_id    text,
  details      jsonb NOT NULL DEFAULT '{}',          -- NEVER secrets
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_time_idx ON app.audit_log (created_at DESC);

CREATE TABLE app.scoreboard_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot    jsonb NOT NULL,                        -- the public board as served
  created_by  uuid REFERENCES app.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- Scoreboard (change #6): ONE view = solves + surprises + signal + morse
-- + adjustments + winner bonus.
-- =====================================================================
CREATE OR REPLACE VIEW app.v_scoreboard AS
WITH ledger AS (
  SELECT team_id, points_awarded AS pts, solved_at AS at, 'solve'::text AS source
    FROM app.solves
  UNION ALL
  SELECT team_id, points_awarded, submitted_at, 'surprise'
    FROM app.surprise_submissions WHERE points_awarded > 0
  UNION ALL
  SELECT team_id, points_awarded, redeemed_at, 'signal'
    FROM app.spider_signal_codes WHERE points_awarded > 0
  UNION ALL
  SELECT team_id, points_awarded, submitted_at, 'morse'
    FROM app.morse_submissions WHERE points_awarded > 0
  UNION ALL
  SELECT team_id, points, created_at, 'adjustment'
    FROM app.score_adjustments
  UNION ALL
  SELECT team_id, bonus_points, awarded_at, 'winner_bonus'
    FROM app.winners WHERE bonus_points > 0
),
totals AS (
  SELECT t.id                                    AS team_id,
         t.name                                  AS team_name,
         t.is_hidden,
         t.is_active,
         COALESCE(SUM(l.pts), 0)::integer        AS total,
         COALESCE(SUM(l.pts) FILTER (WHERE l.source = 'solve'), 0)::integer AS challenge_points,
         COALESCE(SUM(l.pts) FILTER (WHERE l.source IN ('surprise','signal','morse')), 0)::integer AS bonus_points,
         COALESCE(SUM(l.pts) FILTER (WHERE l.source = 'adjustment'), 0)::integer AS adjustment_points,
         COALESCE(SUM(l.pts) FILTER (WHERE l.source = 'winner_bonus'), 0)::integer AS winner_points,
         MAX(l.at) FILTER (WHERE l.pts > 0)      AS last_score_at
    FROM app.teams t
    LEFT JOIN ledger l ON l.team_id = t.id
   GROUP BY t.id, t.name, t.is_hidden, t.is_active
),
solve_counts AS (
  SELECT s.team_id, COUNT(*)::integer AS solves
    FROM app.solves s
    JOIN app.challenges c ON c.id = s.challenge_id AND NOT c.is_practice
   GROUP BY s.team_id
)
SELECT tt.*,
       COALESCE(sc.solves, 0) AS solves,
       ROW_NUMBER() OVER (ORDER BY tt.total DESC, tt.last_score_at ASC NULLS LAST, tt.team_name ASC)::integer AS rank_all
  FROM totals tt
  LEFT JOIN solve_counts sc ON sc.team_id = tt.team_id;

-- Public board: visible + active teams only, ranked among themselves.
CREATE OR REPLACE VIEW app.v_public_scoreboard AS
SELECT ROW_NUMBER() OVER (ORDER BY total DESC, last_score_at ASC NULLS LAST, team_name ASC)::integer AS rank,
       team_id, team_name, total, solves, last_score_at
  FROM app.v_scoreboard
 WHERE NOT is_hidden AND is_active;

-- Public solve feed (no hidden teams, no practice).
CREATE OR REPLACE VIEW app.v_public_feed AS
SELECT s.solved_at, t.name AS team_name, c.number AS challenge_number, c.title AS challenge_title,
       s.points_awarded
  FROM app.solves s
  JOIN app.teams t      ON t.id = s.team_id AND NOT t.is_hidden AND t.is_active
  JOIN app.challenges c ON c.id = s.challenge_id AND NOT c.is_practice;
