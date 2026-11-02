-- docs/09: the four-key final decryption, the late decoder release, and a tester account's access.

-- A team with this reads and submits every question at any event status, published or not.
ALTER TABLE app.teams ADD COLUMN full_access boolean NOT NULL DEFAULT false;

ALTER TABLE app.event_state ADD COLUMN decoder_released boolean NOT NULL DEFAULT false;

-- One row per key, encrypted with REVEAL_ENC_KEY. A value reaches a team only once it has earned it.
CREATE TABLE app.vault_keys (
  slot      smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 4),
  value_enc text NOT NULL
);

-- ---------- Lock the new table like 0002 did ----------
DO $$
DECLARE r text;
BEGIN
  REVOKE ALL ON app.vault_keys FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.vault_keys FROM %I', r);
    END IF;
  END LOOP;
  ALTER TABLE app.vault_keys ENABLE ROW LEVEL SECURITY;
END $$;
