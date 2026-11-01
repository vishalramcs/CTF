-- Simulated file workspaces (first used by the MJ Archive question) and questions a team must unlock.
-- A workspace's files live in code; only each team's progress is stored here.

ALTER TABLE app.challenges ADD COLUMN requires_unlock boolean NOT NULL DEFAULT false;

CREATE TABLE app.team_challenge_unlocks (
  team_id      uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES app.challenges(id) ON DELETE CASCADE,
  source       text NOT NULL,
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, challenge_id)
);

CREATE TABLE app.workspace_deletions (
  team_id    uuid NOT NULL REFERENCES app.teams(id) ON DELETE CASCADE,
  workspace  text NOT NULL,
  file_key   text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, workspace, file_key)
);

-- ---------- Lock the new tables like 0002 did ----------
DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['team_challenge_unlocks', 'workspace_deletions'] LOOP
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
      END IF;
    END LOOP;
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
