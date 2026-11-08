-- 0009: the space signal (docs/13). Additive only: three columns on event_state.
-- final_signal: the organiser's text shown to a team holding all six fragments (server only).
-- final_points: what a correct final answer pays, once per team.
-- coordinate_answer_alt_hashes: HMACs of every accepted final answer (the first is also in
-- coordinate_answer_hash, which stays the "an answer is set" marker).
ALTER TABLE app.event_state
  ADD COLUMN final_signal text,
  ADD COLUMN final_points numeric(7,2) NOT NULL DEFAULT 100 CHECK (final_points >= 0),
  ADD COLUMN coordinate_answer_alt_hashes text[] NOT NULL DEFAULT '{}';
