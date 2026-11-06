-- docs/10: FLASHY SPIDER-MAN, an admin-triggered bonus event. Forward-only: it adds three tables
-- and touches nothing that exists. It is separate from the older `flashy_spider` surprise.

-- One row of settings the admin edits. A run copies them when it starts, so editing mid-run
-- cannot change a result that is already decided.
CREATE TABLE app.flashy_config (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  video_url     text,
  video_seconds integer NOT NULL DEFAULT 70 CHECK (video_seconds BETWEEN 5 AND 600),
  bonus_points  numeric(7,2) NOT NULL DEFAULT 0 CHECK (bonus_points BETWEEN 0 AND 1000),
  question      text NOT NULL DEFAULT 'What is the number you see on the car?',
  -- [{ "id": "...", "label": "..." }]. Which one is correct is only in answer_hash.
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_hash   text,                    -- HMAC(FLAG_HMAC_KEY, 'flashy:'||normalised label)
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.flashy_config (id) VALUES (1);
CREATE TRIGGER flashy_config_touch BEFORE UPDATE ON app.flashy_config
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- One row per trigger. ended_at IS NULL means it is live.
CREATE TABLE app.flashy_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url     text NOT NULL,
  video_seconds integer NOT NULL,
  bonus_points  numeric(7,2) NOT NULL CHECK (bonus_points >= 0),
  question      text NOT NULL,
  options       jsonb NOT NULL,
  answer_hash   text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  started_by    uuid REFERENCES app.users(id) ON DELETE SET NULL,
  ended_by      uuid REFERENCES app.users(id) ON DELETE SET NULL
);
-- At most one live run, so a double-clicked Trigger cannot start two.
CREATE UNIQUE INDEX flashy_one_live_uq ON app.flashy_runs ((true)) WHERE ended_at IS NULL;

-- One row per team and run: playback count, and how the team finished.
CREATE TABLE app.flashy_participation (
  run_id           uuid NOT NULL REFERENCES app.flashy_runs(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  playbacks        smallint NOT NULL DEFAULT 0 CHECK (playbacks BETWEEN 0 AND 2),
  last_playback_at timestamptz,
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'answered', 'skipped')),
  chosen_option    text,
  is_correct       boolean,
  points_awarded   numeric(7,2) NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  PRIMARY KEY (run_id, team_id),
  CONSTRAINT flashy_participation_shape CHECK (
    (state = 'open' AND chosen_option IS NULL AND is_correct IS NULL AND finished_at IS NULL
       AND points_awarded = 0)
    OR (state = 'skipped' AND chosen_option IS NULL AND is_correct IS NULL
       AND finished_at IS NOT NULL AND points_awarded = 0)
    OR (state = 'answered' AND chosen_option IS NOT NULL AND is_correct IS NOT NULL
       AND finished_at IS NOT NULL AND playbacks >= 1)
  )
);

-- The bonus goes through the existing ledger (category 'surprise', ref_type 'flashy_run'), whose
-- unique index on (team_id, ref_type, ref_id) is what makes a second payment impossible.

-- ---------- Lock the new tables like 0002 and 0006 did ----------
DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['flashy_config', 'flashy_runs', 'flashy_participation'] LOOP
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
      END IF;
    END LOOP;
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
