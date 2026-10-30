-- =====================================================================
-- SPIDEY tracXer — 0003_rules_v2.sql
-- Implements docs/07-Rules-v2.md: dynamic scoring, locations, Cosmic Keys,
-- three fixed surprises, score ledger, event status. PRE-LAUNCH ONLY: it
-- deletes rows in tables whose meaning changed (solves, surprises, practice
-- challenge). Never apply it to a database holding real event data.
-- =====================================================================

-- ---------- Drop what v2 removes (views first: they read these tables) ----------
DROP VIEW IF EXISTS app.v_public_feed;
DROP VIEW IF EXISTS app.v_public_scoreboard;
DROP VIEW IF EXISTS app.v_scoreboard;

DROP TABLE IF EXISTS app.surprise_submissions, app.surprise_targets, app.surprise_events,
  app.spider_signal_attempts, app.spider_signal_codes,
  app.morse_submissions, app.morse_targets, app.morse_transmissions,
  app.coordinate_submissions, app.winners, app.score_adjustments CASCADE;

-- ---------- Event status replaces phases ----------
ALTER TABLE app.event_state
  DROP CONSTRAINT event_winner_consistency,
  DROP COLUMN phase, DROP COLUMN phase_started_at, DROP COLUMN phase_ends_at,
  DROP COLUMN coordinates_open, DROP COLUMN coordinates_locked,
  DROP COLUMN coordinate_winner_id, DROP COLUMN coordinate_won_at,
  DROP COLUMN coordinate_answer_hash,
  DROP COLUMN coordinate_hemisphere_lat, DROP COLUMN coordinate_hemisphere_lon,
  DROP COLUMN final_trace_enc, DROP COLUMN winner_bonus_points, DROP COLUMN finale_started_at,
  ADD COLUMN status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'running', 'paused', 'ended')),
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now();

-- ---------- Admin levels (an enum value added here couldn't be used in this transaction) ----------
ALTER TABLE app.users ADD COLUMN admin_level text CHECK (admin_level IN ('super_admin', 'developer'));
UPDATE app.users SET admin_level = 'super_admin' WHERE role = 'admin';
ALTER TABLE app.users ADD CONSTRAINT users_admin_level CHECK ((role = 'admin') = (admin_level IS NOT NULL));

-- ---------- Challenges: no practice, no AI points, fragments move to their own table ----------
DELETE FROM app.challenges WHERE is_practice;
DROP INDEX app.challenges_coordinate_order_uq;
ALTER TABLE app.challenges
  DROP CONSTRAINT challenges_number_range,
  DROP CONSTRAINT challenges_points_nonneg,
  DROP CONSTRAINT challenges_fragment_shape,
  DROP CONSTRAINT challenges_fragment_digits,
  DROP CONSTRAINT challenges_order_range,
  DROP CONSTRAINT challenges_practice_shape,
  DROP CONSTRAINT challenges_practice_number,
  DROP COLUMN is_practice, DROP COLUMN ai_points, DROP COLUMN has_fragment,
  DROP COLUMN fragment_value, DROP COLUMN coordinate_order, DROP COLUMN order_clue,
  ADD CONSTRAINT challenges_number_range CHECK (number BETWEEN 1 AND 10),
  ADD CONSTRAINT challenges_points_nonneg CHECK (base_points > 0);

-- ---------- Locations, fragments, Cosmic Keys ----------
CREATE TABLE app.locations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level               app.challenge_difficulty NOT NULL UNIQUE,
  name                text NOT NULL DEFAULT '',
  answer_hash         text,                          -- HMAC(COORD_HMAC_KEY, normalized city); null until configured
  answer_enc          text,                          -- AES-GCM so a developer can view it
  reward_points       numeric(7,1) NOT NULL CHECK (reward_points > 0),   -- fixed: 3 x base
  fragments_required  integer NOT NULL CHECK (fragments_required > 0)
);
INSERT INTO app.locations (level, name, reward_points, fragments_required) VALUES
  ('easy', 'Easy location', 180, 2),
  ('medium', 'Medium location', 330, 2),
  ('difficult', 'Hard location', 525, 2),
  ('main_difficult', 'Main location', 1200, 1);

-- One fragment per challenge. A team holds a fragment once it has solved that challenge
-- (derived in v_team_fragments, never stored per team). Values never leave the server
-- before they are earned. The fragment's challenge must match the location's level (checked
-- by the app when a developer saves the mapping).
CREATE TABLE app.coordinate_fragments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid NOT NULL REFERENCES app.locations(id) ON DELETE CASCADE,
  challenge_id  uuid NOT NULL UNIQUE REFERENCES app.challenges(id) ON DELETE CASCADE,
  label         text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 20),
  value         text NOT NULL CHECK (char_length(trim(value)) > 0),
  order_clue    text,
  UNIQUE (location_id, label)
);

CREATE TABLE app.location_submissions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES app.locations(id) ON DELETE CASCADE,
  submitted_hash  text NOT NULL,
  is_correct      boolean NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX location_sub_one_correct_uq ON app.location_submissions (team_id, location_id) WHERE is_correct;
CREATE INDEX location_sub_ratelimit_idx ON app.location_submissions (team_id, location_id, submitted_at DESC) WHERE NOT is_correct;

CREATE TABLE app.location_achievements (
  team_id      uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  location_id  uuid NOT NULL REFERENCES app.locations(id) ON DELETE CASCADE,
  achieved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, location_id)
);

CREATE TABLE app.cosmic_keys (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level  app.challenge_difficulty NOT NULL UNIQUE,
  name   text NOT NULL
);
INSERT INTO app.cosmic_keys (level, name) VALUES
  ('easy', 'Easy Cosmic Key'), ('medium', 'Medium Cosmic Key'),
  ('difficult', 'Hard Cosmic Key'), ('main_difficult', 'Main Cosmic Key');

CREATE TABLE app.team_cosmic_keys (
  team_id      uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  key_id       uuid NOT NULL REFERENCES app.cosmic_keys(id) ON DELETE CASCADE,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, key_id)
);

-- ---------- Solves: position and decayed points are decided by the database ----------
DELETE FROM app.solves;
ALTER TABLE app.solves
  DROP COLUMN phase,
  DROP COLUMN points_awarded,
  ADD COLUMN solve_position integer NOT NULL CHECK (solve_position >= 1),
  ADD COLUMN points_awarded numeric(7,1) NOT NULL CHECK (points_awarded >= 0),
  ADD CONSTRAINT solves_position_uq UNIQUE (challenge_id, solve_position);
DROP TYPE app.event_phase;

-- ---------- Score ledger: the single source of truth for scores ----------
CREATE TABLE app.score_transactions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id     uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('challenge', 'location', 'surprise', 'adjustment')),
  points      numeric(7,1) NOT NULL CHECK (points <> 0),
  ref_type    text,                                  -- 'solve' | 'location' | 'surprise'
  ref_id      uuid,
  reason      text,
  admin_id    uuid REFERENCES app.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_adjustment_shape CHECK (
    (category = 'adjustment' AND admin_id IS NOT NULL AND char_length(trim(coalesce(reason, ''))) >= 3)
    OR (category <> 'adjustment' AND ref_type IS NOT NULL AND ref_id IS NOT NULL AND points > 0)
  )
);
-- The same event can never be paid twice.
CREATE UNIQUE INDEX ledger_once_uq ON app.score_transactions (team_id, ref_type, ref_id) WHERE category <> 'adjustment';
CREATE INDEX ledger_team_idx ON app.score_transactions (team_id, created_at);

-- Position, decay and the ledger row come from one trigger, under one lock per challenge, so no
-- application bug or race can award a wrong or duplicate position (docs/07 §3).
CREATE FUNCTION app.solves_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base numeric;
  prior integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('solve:' || NEW.challenge_id::text));
  SELECT base_points INTO STRICT base FROM app.challenges WHERE id = NEW.challenge_id;
  SELECT count(*) INTO prior FROM app.solves WHERE challenge_id = NEW.challenge_id;
  NEW.solve_position := prior + 1;
  NEW.points_awarded := greatest(base - 0.5 * prior, 0);
  RETURN NEW;
END $$;
CREATE TRIGGER solves_before_insert BEFORE INSERT ON app.solves
  FOR EACH ROW EXECUTE FUNCTION app.solves_before_insert();

CREATE FUNCTION app.solves_after_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.points_awarded > 0 THEN
    INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id, created_at)
    VALUES (NEW.team_id, 'challenge', NEW.points_awarded, 'solve', NEW.id, NEW.solved_at);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER solves_after_insert AFTER INSERT ON app.solves
  FOR EACH ROW EXECUTE FUNCTION app.solves_after_insert();

-- ---------- Surprises: exactly three, fixed rewards ----------
CREATE TABLE app.surprise_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL UNIQUE CHECK (kind IN ('spidey_signal', 'flashy_spider', 'spider_mutation')),
  title            text NOT NULL,
  enabled          boolean NOT NULL DEFAULT false,
  available_from   timestamptz,
  available_until  timestamptz,
  content_html     text NOT NULL DEFAULT '',         -- task or question; served only to teams that may see it
  asset_url        text,                             -- flashy_spider video (public, non-secret)
  answer_hash      text,                             -- HMAC(FLAG_HMAC_KEY, 'surprise:'||normalized); null until configured
  answer_enc       text,
  points           numeric(7,1) NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surprise_fixed_points CHECK (
    points = CASE kind WHEN 'spidey_signal' THEN 30 WHEN 'flashy_spider' THEN 50 ELSE 70 END
  )
);
INSERT INTO app.surprise_events (kind, title, points) VALUES
  ('spidey_signal', 'Spidey Signal', 30),
  ('flashy_spider', 'Flashy Spider', 50),
  ('spider_mutation', 'Spider Mutation', 70);
CREATE TRIGGER surprise_events_touch BEFORE UPDATE ON app.surprise_events
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Discovery and completion history, one row per team and surprise.
CREATE TABLE app.surprise_progress (
  team_id        uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES app.surprise_events(id) ON DELETE CASCADE,
  discovered_at  timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  PRIMARY KEY (team_id, event_id)
);

-- Every attempt is a row (CLAUDE.md rule 9).
CREATE TABLE app.surprise_submissions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        uuid NOT NULL REFERENCES app.surprise_events(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  submitted_hash  text NOT NULL,
  is_correct      boolean NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX surprise_sub_one_correct_uq ON app.surprise_submissions (event_id, team_id) WHERE is_correct;
CREATE INDEX surprise_sub_ratelimit_idx ON app.surprise_submissions (team_id, event_id, submitted_at DESC) WHERE NOT is_correct;

CREATE TABLE app.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message     text NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 500),
  created_by  uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

-- ---------- Views ----------
-- Fragments a team has earned: the solve of the fragment's challenge. Server-only.
CREATE VIEW app.v_team_fragments AS
SELECT s.team_id, f.location_id, f.id AS fragment_id, f.challenge_id, f.label, f.value, f.order_clue, s.solved_at
  FROM app.solves s
  JOIN app.coordinate_fragments f ON f.challenge_id = s.challenge_id;

-- Total = sum of the ledger. Tie-break: earlier time of reaching the total, then a shared rank.
CREATE VIEW app.v_scoreboard AS
WITH totals AS (
  SELECT t.id AS team_id, t.name AS team_name, t.is_hidden, t.is_active,
         COALESCE(SUM(l.points), 0)::numeric(7,1)                                        AS total,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'challenge'), 0)::numeric(7,1)  AS challenge_points,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'location'), 0)::numeric(7,1)   AS location_points,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'surprise'), 0)::numeric(7,1)   AS surprise_points,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'adjustment'), 0)::numeric(7,1) AS adjustment_points,
         MAX(l.created_at)                                                               AS last_score_at
    FROM app.teams t
    LEFT JOIN app.score_transactions l ON l.team_id = t.id
   GROUP BY t.id, t.name, t.is_hidden, t.is_active
)
SELECT tt.*,
       (SELECT count(*) FROM app.solves s WHERE s.team_id = tt.team_id)::integer                AS solves,
       (SELECT count(*) FROM app.location_achievements a WHERE a.team_id = tt.team_id)::integer AS locations,
       (SELECT count(*) FROM app.team_cosmic_keys k WHERE k.team_id = tt.team_id)::integer      AS keys,
       (SELECT count(*) FROM app.surprise_progress p
         WHERE p.team_id = tt.team_id AND p.completed_at IS NOT NULL)::integer                  AS surprises,
       RANK() OVER (ORDER BY tt.total DESC, tt.last_score_at ASC NULLS LAST)::integer           AS rank_all
  FROM totals tt;

-- Public board: visible, active teams only, ranked among themselves. No team_id.
CREATE VIEW app.v_public_scoreboard AS
SELECT RANK() OVER (ORDER BY total DESC, last_score_at ASC NULLS LAST)::integer AS rank,
       team_name, challenge_points, location_points, surprise_points, adjustment_points, total,
       solves, locations, keys, surprises, last_score_at
  FROM app.v_scoreboard
 WHERE NOT is_hidden AND is_active;

CREATE VIEW app.v_public_feed AS
SELECT s.solved_at, t.name AS team_name, c.number AS challenge_number, c.title AS challenge_title,
       s.points_awarded
  FROM app.solves s
  JOIN app.teams t      ON t.id = s.team_id AND NOT t.is_hidden AND t.is_active
  JOIN app.challenges c ON c.id = s.challenge_id;

-- ---------- Lock the new tables like 0002 did ----------
REVOKE ALL ON ALL TABLES    IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
DO $$
DECLARE r text;
DECLARE t record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
    END IF;
  END LOOP;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
