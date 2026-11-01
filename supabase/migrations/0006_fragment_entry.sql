-- A question can hide its coordinate in its flag: after a correct flag the team types the decoded
-- coordinate into a box, and only a correct entry puts the fragment on its board.

ALTER TABLE app.challenges ADD COLUMN fragment_needs_entry boolean NOT NULL DEFAULT false;

CREATE TABLE app.fragment_claims (
  team_id      uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, challenge_id)
);

-- Every checked entry is a row, like every other answer type. Rate limits count the wrong ones.
CREATE TABLE app.fragment_claim_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id      uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  is_correct   boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fragment_claim_attempts_ratelimit_idx
  ON app.fragment_claim_attempts (team_id, challenge_id, submitted_at DESC) WHERE NOT is_correct;

-- ---------- Lock the new tables like 0002 did ----------
DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fragment_claims', 'fragment_claim_attempts'] LOOP
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
      END IF;
    END LOOP;
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
