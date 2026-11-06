-- 0008: the Main Question's six beacon flags, and a place-name answer per location (docs/12).
-- Additive only: new tables, one column, the solve trigger and the ledger category check.

-- ---------- Main Question parts ----------
-- Each part is one flag. Part n earns fragment slot n (L1-N .. L3-S).
CREATE TABLE app.challenge_parts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  part         smallint NOT NULL CHECK (part BETWEEN 1 AND 6),
  flag_hash    text NOT NULL,                    -- HMAC(FLAG_HMAC_KEY, normalized flag); never returned
  UNIQUE (challenge_id, part)
);

CREATE TABLE app.part_solves (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  part_id         uuid NOT NULL REFERENCES app.challenge_parts(id) ON DELETE CASCADE,
  solve_position  integer NOT NULL,
  points_awarded  numeric(7,2) NOT NULL,
  solved_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, part_id)
);

-- Same position formula as solves, on a sixth of the challenge's base points, under one lock per part.
CREATE FUNCTION app.part_solves_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base numeric;
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('part:' || NEW.part_id::text));
  SELECT c.base_points / 6.0 INTO STRICT base
    FROM app.challenge_parts p JOIN app.challenges c ON c.id = p.challenge_id
   WHERE p.id = NEW.part_id;
  SELECT count(*) + 1 INTO n FROM app.part_solves WHERE part_id = NEW.part_id;
  NEW.solve_position := n;
  NEW.points_awarded := round(greatest(
    CASE WHEN n <= 5 THEN base - (n - 1) * 0.5 ELSE base - 2.0 - (n - 5) * 0.25 END, 0), 2);
  RETURN NEW;
END $$;
CREATE TRIGGER part_solves_before_insert BEFORE INSERT ON app.part_solves
  FOR EACH ROW EXECUTE FUNCTION app.part_solves_before_insert();

CREATE FUNCTION app.part_solves_after_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.points_awarded > 0 THEN
    INSERT INTO app.score_transactions (team_id, category, points, ref_type, ref_id, created_at)
    VALUES (NEW.team_id, 'challenge', NEW.points_awarded, 'part', NEW.id, NEW.solved_at);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER part_solves_after_insert AFTER INSERT ON app.part_solves
  FOR EACH ROW EXECUTE FUNCTION app.part_solves_after_insert();

-- A challenge with parts pays through its parts. Its own solve row (written when the last part is
-- found) keeps its position for ranking and the feed, but pays nothing.
CREATE OR REPLACE FUNCTION app.solves_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base numeric;
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('solve:' || NEW.challenge_id::text));
  SELECT base_points INTO STRICT base FROM app.challenges WHERE id = NEW.challenge_id;
  SELECT count(*) + 1 INTO n FROM app.solves WHERE challenge_id = NEW.challenge_id;
  NEW.solve_position := n;
  IF EXISTS (SELECT 1 FROM app.challenge_parts WHERE challenge_id = NEW.challenge_id) THEN
    NEW.points_awarded := 0;
  ELSE
    NEW.points_awarded := greatest(
      CASE WHEN n <= 5 THEN base - (n - 1) * 0.5 ELSE base - 2.0 - (n - 5) * 0.25 END, 0);
  END IF;
  RETURN NEW;
END $$;

-- ---------- Location answers ----------
ALTER TABLE app.event_state
  ADD COLUMN location_points numeric(7,2) NOT NULL DEFAULT 25 CHECK (location_points >= 0);

ALTER TABLE app.score_transactions DROP CONSTRAINT score_transactions_category_check;
ALTER TABLE app.score_transactions
  ADD CONSTRAINT score_transactions_category_check
  CHECK (category IN ('challenge', 'location', 'surprise', 'adjustment'));

-- One row per checked attempt. The answer is the place name in app.final_coordinates.label.
CREATE TABLE app.location_answers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  position       smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  submitted_hash text NOT NULL,
  is_correct     boolean NOT NULL,
  submitted_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX location_answers_one_correct_uq ON app.location_answers (team_id, position) WHERE is_correct;
CREATE INDEX location_answers_team_idx ON app.location_answers (team_id, submitted_at DESC);

-- ---------- Lock the new tables like 0002 and 0007 did ----------
DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['challenge_parts', 'part_solves', 'location_answers'] LOOP
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
      END IF;
    END LOOP;
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
