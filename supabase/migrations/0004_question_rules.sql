-- =====================================================================
-- SPIDEY tracXer — 0004_question_rules.sql
-- Implements docs/08-Question-Rules.md: 12 regular questions plus a Main Question, two-tier
-- position scoring (2 decimals), six coordinate fragments on questions, three final coordinates,
-- a separate coordinate race, a new ranking, and a scheduled freeze.
-- PRE-LAUNCH ONLY: it drops the location and Cosmic Key tables and deletes their ledger rows.
-- Never apply it to a database holding real event data.
-- =====================================================================

-- ---------- Views first: they read the columns whose type changes ----------
DROP VIEW IF EXISTS app.v_public_feed;
DROP VIEW IF EXISTS app.v_public_scoreboard;
DROP VIEW IF EXISTS app.v_scoreboard;
DROP VIEW IF EXISTS app.v_team_fragments;

-- ---------- Locations and Cosmic Keys are gone ----------
DROP TABLE IF EXISTS app.team_cosmic_keys, app.cosmic_keys, app.location_achievements,
  app.location_submissions, app.coordinate_fragments, app.locations CASCADE;
DELETE FROM app.score_transactions WHERE category = 'location';
ALTER TABLE app.score_transactions DROP CONSTRAINT score_transactions_category_check;
ALTER TABLE app.score_transactions
  ADD CONSTRAINT score_transactions_category_check
  CHECK (category IN ('challenge', 'surprise', 'adjustment'));

-- ---------- Points keep two decimals: 47.75 must not round ----------
ALTER TABLE app.solves             ALTER COLUMN points_awarded TYPE numeric(7,2);
ALTER TABLE app.score_transactions ALTER COLUMN points TYPE numeric(7,2);
ALTER TABLE app.surprise_events    ALTER COLUMN points TYPE numeric(7,2);

-- ---------- Challenges: numbers 1-13, one Main Question, fragments at challenge level ----------
ALTER TABLE app.challenges
  DROP CONSTRAINT challenges_number_range,
  ADD CONSTRAINT challenges_number_range CHECK (number BETWEEN 1 AND 13),
  ADD COLUMN fragment_value text CHECK (fragment_value IS NULL OR char_length(trim(fragment_value)) > 0),
  ADD COLUMN coordinate_order smallint CHECK (coordinate_order BETWEEN 1 AND 6),
  ADD COLUMN order_clue text,
  ADD CONSTRAINT challenges_fragment_pair CHECK ((fragment_value IS NULL) = (coordinate_order IS NULL)),
  ADD CONSTRAINT challenges_no_main_fragment CHECK (difficulty <> 'main_difficult' OR fragment_value IS NULL);
-- The exactly-2-per-difficulty rule is checked by the admin code: a table check can't count rows.
CREATE UNIQUE INDEX challenges_coordinate_order_uq ON app.challenges (coordinate_order)
  WHERE coordinate_order IS NOT NULL;
CREATE UNIQUE INDEX challenges_one_main_uq ON app.challenges ((true)) WHERE difficulty = 'main_difficult';

-- The three coordinates a Main Question solve unlocks. Server-only until a team solves it.
CREATE TABLE app.final_coordinates (
  position  smallint PRIMARY KEY CHECK (position BETWEEN 1 AND 3),
  label     text NOT NULL DEFAULT '',
  value     text NOT NULL CHECK (char_length(trim(value)) > 0)
);

-- ---------- Coordinate race ----------
ALTER TABLE app.event_state
  ADD COLUMN coordinate_answer_hash text,        -- HMAC(COORD_HMAC_KEY, normalized final location)
  ADD COLUMN coordinate_answer_enc  text,        -- AES-GCM so an admin can view it
  ADD COLUMN coordinate_winner_id   uuid REFERENCES app.teams(id) ON DELETE SET NULL,
  ADD COLUMN coordinate_won_at      timestamptz,
  ADD COLUMN freeze_at              timestamptz;

CREATE TABLE app.coordinate_submissions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  submitted_hash  text NOT NULL,
  is_correct      boolean NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coordinate_sub_one_correct_uq ON app.coordinate_submissions (team_id) WHERE is_correct;
CREATE INDEX coordinate_sub_ratelimit_idx ON app.coordinate_submissions (team_id, submitted_at DESC) WHERE NOT is_correct;

-- ---------- Position scoring: 5 steps of 0.5, then 0.25 each (docs/08 §2) ----------
CREATE OR REPLACE FUNCTION app.solves_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base numeric;
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('solve:' || NEW.challenge_id::text));
  SELECT base_points INTO STRICT base FROM app.challenges WHERE id = NEW.challenge_id;
  SELECT count(*) + 1 INTO n FROM app.solves WHERE challenge_id = NEW.challenge_id;
  NEW.solve_position := n;
  NEW.points_awarded := greatest(
    CASE WHEN n <= 5 THEN base - (n - 1) * 0.5 ELSE base - 2.0 - (n - 5) * 0.25 END, 0);
  RETURN NEW;
END $$;

-- ---------- Views ----------
-- Total = sum of the ledger. Ranking (docs/08 §4): total, coordinates found, Main solve, Difficult
-- solved, Medium solved, time the final score was reached. Missing times sort last; full ties share a rank.
CREATE VIEW app.v_scoreboard AS
WITH totals AS (
  SELECT t.id AS team_id, t.name AS team_name, t.is_hidden, t.is_active,
         COALESCE(SUM(l.points), 0)::numeric(7,2)                                          AS total,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'challenge'), 0)::numeric(7,2)  AS challenge_points,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'surprise'), 0)::numeric(7,2)   AS surprise_points,
         COALESCE(SUM(l.points) FILTER (WHERE l.category = 'adjustment'), 0)::numeric(7,2) AS adjustment_points,
         MAX(l.created_at)                                                                 AS last_score_at
    FROM app.teams t
    LEFT JOIN app.score_transactions l ON l.team_id = t.id
   GROUP BY t.id, t.name, t.is_hidden, t.is_active
), solved AS (
  SELECT s.team_id,
         count(*) FILTER (WHERE c.difficulty = 'easy')::integer           AS easy_solved,
         count(*) FILTER (WHERE c.difficulty = 'medium')::integer         AS medium_solved,
         count(*) FILTER (WHERE c.difficulty = 'difficult')::integer      AS difficult_solved,
         min(s.solved_at) FILTER (WHERE c.difficulty = 'main_difficult')  AS main_solved_at
    FROM app.solves s JOIN app.challenges c ON c.id = s.challenge_id
   GROUP BY s.team_id
), found AS (
  SELECT team_id, min(submitted_at) AS coordinates_found_at
    FROM app.coordinate_submissions WHERE is_correct GROUP BY team_id
), joined AS (
  SELECT tt.*,
         COALESCE(sv.easy_solved, 0)      AS easy_solved,
         COALESCE(sv.medium_solved, 0)    AS medium_solved,
         COALESCE(sv.difficult_solved, 0) AS difficult_solved,
         sv.main_solved_at,
         f.coordinates_found_at,
         (SELECT count(*) FROM app.surprise_progress p
           WHERE p.team_id = tt.team_id AND p.completed_at IS NOT NULL)::integer AS surprises
    FROM totals tt
    LEFT JOIN solved sv ON sv.team_id = tt.team_id
    LEFT JOIN found f   ON f.team_id = tt.team_id
)
SELECT j.*,
       (j.easy_solved + j.medium_solved + j.difficult_solved
         + (j.main_solved_at IS NOT NULL)::integer)::integer AS solves,
       RANK() OVER (ORDER BY j.total DESC, j.coordinates_found_at ASC NULLS LAST,
                    j.main_solved_at ASC NULLS LAST, j.difficult_solved DESC, j.medium_solved DESC,
                    j.last_score_at ASC NULLS LAST)::integer AS rank_all
  FROM joined j;

-- Public board: visible, active teams ranked among themselves. No team_id, no times, no coordinates.
CREATE VIEW app.v_public_scoreboard AS
SELECT RANK() OVER (ORDER BY total DESC, coordinates_found_at ASC NULLS LAST,
                    main_solved_at ASC NULLS LAST, difficult_solved DESC, medium_solved DESC,
                    last_score_at ASC NULLS LAST)::integer AS rank,
       team_name, total, easy_solved, medium_solved, difficult_solved,
       (main_solved_at IS NOT NULL) AS main_done,
       (coordinates_found_at IS NOT NULL) AS coordinates_done
  FROM app.v_scoreboard
 WHERE NOT is_hidden AND is_active;

-- Solves plus two marked events. Nothing here is a secret: names, numbers, points, times.
CREATE VIEW app.v_public_feed AS
SELECT s.solved_at AS occurred_at, 'solve'::text AS kind, t.name AS team_name,
       c.number AS challenge_number, c.title AS challenge_title, s.points_awarded
  FROM app.solves s
  JOIN app.teams t      ON t.id = s.team_id AND NOT t.is_hidden AND t.is_active
  JOIN app.challenges c ON c.id = s.challenge_id
UNION ALL
SELECT s.solved_at, 'main_first', t.name, c.number, c.title, NULL::numeric(7,2)
  FROM app.solves s
  JOIN app.teams t      ON t.id = s.team_id AND NOT t.is_hidden AND t.is_active
  JOIN app.challenges c ON c.id = s.challenge_id AND c.difficulty = 'main_difficult'
 WHERE s.solve_position = 1
UNION ALL
SELECT e.coordinate_won_at, 'coordinate_winner', t.name, NULL::integer, NULL::text, NULL::numeric(7,2)
  FROM app.event_state e
  JOIN app.teams t ON t.id = e.coordinate_winner_id AND NOT t.is_hidden AND t.is_active;

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
