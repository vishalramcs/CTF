# 13: The space signal (final race)

Organiser decision, 8 Nov 2026. **Adds a final step after docs/12; overrides 08 §5 where they disagree.** No answers, coordinates or flags belong in this file (the repository is public).

## 1. Flow

1. The three Earth locations (docs/11, docs/12) stay exactly as they are: six fragments, three place names, +`location_points` each.
2. A team that holds **all six fragments** sees the **space signal** on its Locations board: the organiser's text (right ascension, declination, distance) from `event_state.final_signal`, and a download of the celestial catalogue CSV.
3. The team cross-checks the signal against the catalogue and names the object.
4. A correct answer pays `event_state.final_points` (default 100) once per team (ledger category `location`, `ref_type = 'final_answer'`, `ref_id = team id`, so the ledger index makes a second payment impossible). The **first** correct real team (not `full_access`) is the winner: `event_state.coordinate_winner_id`, the `coordinate_winner` feed item, and `coordinates_found_at` is the first ranking tie-break (docs/08 §4, unchanged).

## 2. Rules

- Server only. Nothing is sent before the team holds six fragments: not the signal text, not the CSV (`GET /api/coordinates/catalog` answers 403 until then), not the answer.
- Accepted answers are set in Admin, Coordinates, one per line (e.g. the catalogue designation and the common name). Each is stored as `HMAC(COORD_HMAC_KEY, normalised)` (`coordinate_answer_hash` for the first, `coordinate_answer_alt_hashes` for all) plus one encrypted copy for the audited reveal. Normalising drops case, punctuation and spaces, so `NGC7000` and `ngc 7000` match.
- 8 wrong answers per 60 s per team. One correct answer per team (`coordinate_sub_one_correct_uq`).
- The catalogue (`src/lib/workspace/files/final-signal/celestial_catalog.csv`) lists the target among real decoys and near-miss survey candidates. It holds no coordinates the team does not already have, so it is safe in the public repository.

## 3. Where

Migration `0009_space_signal.sql`, `src/lib/coordinates/submit.ts`, `src/lib/coordinates/state.ts`, `src/app/api/coordinates/catalog/route.ts`, `src/app/api/admin/coordinates/signal/route.ts`, the coordinate board and the admin Coordinates panel.
