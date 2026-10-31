# 08 — Question Rules (overrides 07 where they disagree)

Source: the organisers' revised rules. Migration `0004_question_rules.sql`. Everything not mentioned here stays as in 01–07. Migration 0003's locations and Cosmic Keys are gone.

## 1. Questions
- 12 regular questions plus one Main Question. Numbers 1-4 Easy (base 50), 5-8 Medium (75), 9-12 Difficult (100), 13 Main Question (200, enum `main_difficult`, shown as "Main Question"). Only one Main Question may exist.
- All support team variants and flag wrappers. Admins can set difficulty, base points and `is_published` per question.

## 2. Points by solving position n (per question)
- n <= 5: `base - (n-1) * 0.5`. n > 5: `base - 2.0 - (n-5) * 0.25`. Never negative. Base 50: 50, 49.5, 49, 48.5, 48, 47.75, 47.5.
- Computed only by the `solves_before_insert` trigger under a per-question advisory lock. Points are `numeric(7,2)` everywhere. One award per team per question; wrong submissions award nothing. The surprises (30, 50, 70) still count.

## 3. Coordinate fragments
- Exactly 6 regular questions carry a fragment: 2 Easy, 2 Medium, 2 Difficult, with a unique `coordinate_order` 1-6. Stored on `challenges` (`fragment_value`, `coordinate_order`, `order_clue`), identical for all teams, never on the Main Question. The admin code validates the 2/2/2 split; the table enforces the pairing, the range and uniqueness.
- A fragment (and its order clue) is shown only after the team solves that question. The real order is never sent. Fragments carry no points.
- `{{fragment}}` in flag templates comes from `challenges.fragment_value`.

## 4. Ranking and leaderboard
Order: (1) total points; (2) earliest time the team found the coordinates; (3) earliest Main Question solve; (4) most Difficult solved; (5) most Medium solved; (6) earliest time the final score was reached. Teams equal on all six share a rank. Missing times sort last.
Public board: rank, team, total, Easy/Medium/Difficult solved, Main done, coordinates done. Never answers, flags, wrong submissions, team ids or coordinate values. The feed lists solves plus a marked event for the Main first solver and the coordinate winner.

## 5. Main Question and coordinate race
- Solving the Main Question returns the three `final_coordinates` (only to that team), and records who solved first and when. It does not replace the 6 fragments.
- Final location: a team submits it in a box. The first correct submission is the coordinate winner (`event_state.coordinate_winner_id`), announced in the feed, with no bonus points. Later correct submissions only set that team's coordinates-done status.
- The answer is stored as an HMAC of the normalised text (`COORD_HMAC_KEY`) plus an encrypted copy. Requires the event running; 5 wrong per 60 s; every checked attempt writes a row; team advisory lock, then `event_state ... FOR UPDATE` so exactly one team wins. A team need not have solved anything to submit.
- The coordinate winner and the overall leader are tracked separately and may differ.

## 6. Admin
Create/edit all 13 questions; assign fragments; final coordinates; final location answer; solve order and points per question (`/admin/solves`); per-question reset of solves and their ledger rows in one audited transaction; coordinate winner and Main first solver (`/admin/coordinates`); live leaderboard; `is_published`.

## 7. Freeze at finale time
`event_state.freeze_at`. `/api/public/state` freezes the board once, in a transaction with `FOR UPDATE`, on the first read after that time, writing the snapshot in the public board's shape. An admin unfreeze or event reset clears `freeze_at`.
