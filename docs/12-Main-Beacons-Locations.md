# 12: Main Question beacons and location answers

Organiser decision, 7 Nov 2026. **Overrides 11 where they disagree.** No answers or flags belong in this file.

## 1. Main Question: six beacon flags

- Q13 keeps its tracker puzzle (one real chain on C-14, 5 pulses, 90 s apart in true time, station clock offsets, four decoy chains), but the real chain has **six beacons** and each decodes on its own (hex, then text, then Base64) to a flag `EYE{WORD}`.
- The six flags live in `app.challenge_parts` (part 1-6, HMAC hash only). They are submitted in the same box, in any order. Beacon n, in true-time order, earns fragment slot n (L1-N .. L3-S).
- Each part pays a sixth of Q13's base points, position-scored per part like a question (trigger `part_solves_before_insert`), through the ledger (`ref_type = 'part'`). `part_solves` is unique per team and part.
- When a team finds the sixth part, its own Q13 solve row is written. It pays 0 (the solve trigger skips challenges with parts) but marks the Main Question done for ranking and the feed.
- Solving Q13 no longer grants all six fragments at once. A fragment comes from its regular question or its beacon, whichever comes first.

## 2. Location answers

- Once a team holds both fragments of a location, the dashboard shows a box under it. The team types the place; the answer is the label of `app.final_coordinates` at that position, compared loosely on the server.
- A correct answer pays `event_state.location_points` (default 25) once per team and location, ledger category `location`, `ref_type = 'location_answer'`. 8 wrong answers per 60 s per team.
- The place name is sent to a team only after it has named it correctly.

## 3. Where

Migration `0008_main_parts_locations.sql`, `src/lib/scoring/parts.ts`, `src/lib/coordinates/locations.ts`, `src/app/api/coordinates/locations/route.ts`, the coordinate board and the flag form. Evidence: `seed-output/make_evidence.py`; the six words are in `seed-output/vault.json` (never committed).
